// node-api/src/routes/payments.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';
import Stripe from 'stripe';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

// Helper function to get user ID from JWT
function getUserId(req: any) {
  return req.user?.id || req.user?.sub;
}

// Create Setup Intent for payment method collection
router.post('/create-setup-intent', requireJwt, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    
    // Check if user already has a subscription
    const [existingSubscription] = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = ?',
      [userId]
    ) as any[];

    let stripeCustomerId: string;

    if (existingSubscription && existingSubscription.length > 0) {
      // Use existing customer ID
      stripeCustomerId = existingSubscription[0].customer;
    } else {
      // Get user details
      const [users] = await pool.query(
        'SELECT email, full_name FROM users WHERE id = ?',
        [userId]
      ) as any[];

      if (!users || users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = users[0] as any;

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.full_name,
      });

      stripeCustomerId = customer.id;

      // Store customer ID in subscription record
      await pool.execute(
        'INSERT INTO subscriptions (user_id, customer, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [userId, stripeCustomerId]
      );
    }

    // Create setup intent
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
    });

    res.json({
      client_secret: setupIntent.client_secret,
      intent: setupIntent.id,
      customer: stripeCustomerId
    });

  } catch (error: any) {
    console.error('Setup intent creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Payment Intent for subscription creation
router.post('/create-subscription', requireJwt, async (req: any, res) => {
  try {
    const { intent, customer } = req.body;
    const userId = getUserId(req);

    if (!intent || !customer) {
      return res.status(400).json({ 
        success: false, 
        message: 'Intent and customer are required' 
      });
    }

    // Retrieve the setup intent
    const setupIntent = await stripe.setupIntents.retrieve(intent);
    const paymentMethodId = setupIntent.payment_method;

    if (!paymentMethodId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment method not found' 
      });
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId as string, {
      customer: customer,
    });

    // Set as default payment method
    await stripe.customers.update(customer, {
      invoice_settings: {
        default_payment_method: paymentMethodId as string,
      },
    });

    // Check if user has used trial before
    const [users] = await pool.query(
      'SELECT trial_status FROM users WHERE id = ?',
      [userId]
    ) as any[];

    const hasUsedTrial = users && users.length > 0 && users[0].trial_status !== null;

    // Create subscription parameters
    const subscriptionParams: any = {
      customer: customer,
      items: [{ price: process.env.STRIPE_PLAN_ID }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    };

    // Add trial period if user hasn't used trial
    if (!hasUsedTrial) {
      subscriptionParams.trial_period_days = 1;
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create(subscriptionParams);

    if (subscription.status === 'active' || subscription.status === 'trialing') {
      // Get current timestamp as fallback
      const now = new Date();
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

      // Safely get subscription dates with fallbacks
      const startDate = subscription.current_period_start 
        ? new Date(subscription.current_period_start * 1000)
        : now;
      
      const endDate = subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000)
        : oneMonthFromNow;

      // Validate dates before converting to ISO string
      const subscriptionStart = isNaN(startDate.getTime()) ? now : startDate;
      const subscriptionEnd = isNaN(endDate.getTime()) ? oneMonthFromNow : endDate;

      // Store subscription data
      const subscriptionData = {
        subscription_id: subscription.id,
        customer: customer,
        plan_id: subscription.items.data[0].price.id,
        subscription_start: subscriptionStart.toISOString(),
        subscription_end: subscriptionEnd.toISOString(),
        plan_amount: (subscription.items.data[0].price.unit_amount || 0) / 100,
        currency: subscription.items.data[0].price.currency,
        interval: subscription.items.data[0].price.recurring?.interval || 'month',
        payment_status: subscription.status === 'trialing' ? 'Trial' : 'Paid',
        type: 'stripe',
        comments: subscription.status === 'trialing' ? 'Subscription in 1-day trial' : 'Subscription created',
      };

      // Update or create subscription record
      await pool.execute(
        `INSERT INTO subscriptions 
         (user_id, subscription_id, customer, plan_id, subscription_start, subscription_end, 
          plan_amount, currency, \`interval\`, payment_status, type, comments, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         subscription_id = VALUES(subscription_id),
         customer = VALUES(customer),
         plan_id = VALUES(plan_id),
         subscription_start = VALUES(subscription_start),
         subscription_end = VALUES(subscription_end),
         plan_amount = VALUES(plan_amount),
         currency = VALUES(currency),
         \`interval\` = VALUES(\`interval\`),
         payment_status = VALUES(payment_status),
         type = VALUES(type),
         comments = VALUES(comments),
         updated_at = NOW()`,
        [
          userId, subscriptionData.subscription_id, subscriptionData.customer,
          subscriptionData.plan_id, subscriptionData.subscription_start,
          subscriptionData.subscription_end, subscriptionData.plan_amount,
          subscriptionData.currency, subscriptionData.interval,
          subscriptionData.payment_status, subscriptionData.type, subscriptionData.comments
        ]
      );

      // Update user trial information
      const trialStart = (subscription as any).trial_start ? 
        new Date((subscription as any).trial_start * 1000) : 
        new Date((subscription as any).current_period_start * 1000);
      
      const trialEnd = (subscription as any).trial_end ? 
        new Date((subscription as any).trial_end * 1000) : 
        new Date((subscription as any).current_period_end * 1000);

      // Convert to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
      const trialStartFormatted = trialStart.toISOString().slice(0, 19).replace('T', ' ');
      const trialEndFormatted = trialEnd.toISOString().slice(0, 19).replace('T', ' ');

      await pool.execute(
        'UPDATE users SET trial_start = ?, trial_end = ?, subscription_status = 1 WHERE id = ?',
        [trialStartFormatted, trialEndFormatted, userId]
      );

      // Update trial status if trial is granted
      if (!hasUsedTrial && subscription.status === 'trialing') {
        await pool.execute(
          'UPDATE users SET trial_status = ? WHERE id = ?',
          ['active', userId]
        );
      }

      res.json({
        success: true,
        status: subscription.status,
        message: subscription.status === 'trialing' ? 
          'Subscription started with 1-day trial' : 
          'Subscription started without trial',
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Subscription could not be activated',
      });
    }

  } catch (error: any) {
    console.error('Subscription creation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription',
      error: error.message,
    });
  }
});

// Stripe webhook handler
router.post('/stripe/webhook', async (req: any, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret || '');
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Webhook handlers
async function handleSubscriptionCreated(subscription: any) {
  await updateSubscriptionStatus(subscription, 'Active');
}

async function handleSubscriptionUpdated(subscription: any) {
  await updateSubscriptionStatus(subscription, 'Updated');
}

async function handleSubscriptionDeleted(subscription: any) {
  await updateSubscriptionStatus(subscription, 'Cancelled');
}

async function handlePaymentSucceeded(invoice: any) {
  await updateMonthlyPayment(invoice, 'Paid');
}

async function handlePaymentFailed(invoice: any) {
  await updateMonthlyPayment(invoice, 'Cancelled');
}

async function updateSubscriptionStatus(subscription: any, status: string) {
  try {
    const [existingSubscription] = await pool.query(
      'SELECT * FROM subscriptions WHERE subscription_id = ?',
      [subscription.id]
    ) as any[];

    if (existingSubscription && existingSubscription.length > 0) {
      await pool.execute(
        'UPDATE subscriptions SET payment_status = ?, comments = ? WHERE subscription_id = ?',
        [status, 'Status updated due to Stripe event', subscription.id]
      );

      const userId = existingSubscription[0].user_id;
      
      // Update user subscription status
      const subscriptionStatus = (status === 'Cancelled' || status === 'Expired') ? 0 : 1;
      await pool.execute(
        'UPDATE users SET subscription_status = ? WHERE id = ?',
        [subscriptionStatus, userId]
      );
    }
  } catch (error) {
    console.error('Error updating subscription status:', error);
  }
}

async function updateMonthlyPayment(invoice: any, status: string) {
  try {
    const subscriptionId = invoice.subscription;
    const customerId = invoice.customer;
    const amountPaid = invoice.amount_paid / 100;

    const [existingSubscription] = await pool.query(
      'SELECT * FROM subscriptions WHERE subscription_id = ?',
      [subscriptionId]
    ) as any[];

    if (existingSubscription && existingSubscription.length > 0) {
      await pool.execute(
        'UPDATE subscriptions SET payment_status = ?, comments = ? WHERE subscription_id = ?',
        [status, 'Status updated due to Stripe event', subscriptionId]
      );

      const userId = existingSubscription[0].user_id;
      
      // Update user subscription status
      const subscriptionStatus = (status === 'Cancelled' || status === 'Expired') ? 0 : 1;
      await pool.execute(
        'UPDATE users SET subscription_status = ? WHERE id = ?',
        [subscriptionStatus, userId]
      );
    }
  } catch (error) {
    console.error('Error updating monthly payment:', error);
  }
}

// Legacy subscription method (direct card input)
router.post('/subscribe', requireJwt, async (req: any, res) => {
  try {
    const { card_number, exp_month, exp_year, cvc, first_name, last_name } = req.body;
    const userId = getUserId(req);

    // Validate required fields
    if (!card_number || !exp_month || !exp_year || !cvc) {
      return res.status(400).json({ 
        status: false, 
        message: 'Card details are required' 
      });
    }

    // Check if user already has subscription
    const [existingSubscription] = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = ? AND comments != ""',
      [userId]
    ) as any[];

    if (existingSubscription && existingSubscription.length > 0) {
      return res.json({
        status: false,
        message: 'Already subscribed'
      });
    }

    // Create Stripe token
    const token = await stripe.tokens.create({
      card: {
        number: card_number,
        exp_month: parseInt(exp_month),
        exp_year: parseInt(exp_year),
        cvc: cvc,
        name: `${first_name} ${last_name}`
      }
    } as any);

    // Get user details
    const [users] = await pool.query(
      'SELECT email FROM users WHERE id = ?',
      [userId]
    ) as any[];

    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0] as any;

    // Create customer
    const customer = await stripe.customers.create({
      email: user.email,
      description: "Kitab Cloud Plan",
      source: token.id,
    });

    // Create charge
    await stripe.charges.create({
      amount: 200, // $2.00
      currency: 'usd',
      customer: customer.id,
      description: 'Subscription Plan',
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PLAN_ID }],
    });

    // Store subscription in database
    await pool.execute(
      `INSERT INTO subscriptions 
       (user_id, subscription_id, customer, plan_id, subscription_start, subscription_end, 
        plan_amount, currency, \`interval\`, payment_status, type, comments, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        userId, subscription.id, customer.id, subscription.items.data[0].price.id,
        new Date((subscription as any).current_period_start * 1000).toISOString(),
        new Date((subscription as any).current_period_end * 1000).toISOString(),
        (subscription.items.data[0].price.unit_amount || 0) / 100,
        subscription.items.data[0].price.currency,
        subscription.items.data[0].price.recurring?.interval || 'month',
        'Success', 'stripe', 'Ok'
      ]
    );

    // Update user subscription status
    await pool.execute(
      'UPDATE users SET trial_start = NOW(), trial_end = DATE_ADD(NOW(), INTERVAL 1 MONTH), subscription_status = 1 WHERE id = ?',
      [userId]
    );

    res.json({
      status: true,
      message: 'Subscribed Successfully'
    });

  } catch (error: any) {
    console.error('Subscription failed:', error);
    res.status(500).json({
      status: false,
      message: error.message
    });
  }
});

// Initiate trial
router.post('/initiate-trial', requireJwt, async (req: any, res) => {
  try {
    const { email, card_number, exp_month, exp_year, cvc, first_name, last_name } = req.body;

    if (!email || !card_number || !exp_month || !exp_year || !cvc) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Find user by email
    const [users] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    ) as any[];

    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].id;

    // Create Stripe token
    const token = await stripe.tokens.create({
      card: {
        number: card_number,
        exp_month: parseInt(exp_month),
        exp_year: parseInt(exp_year),
        cvc: cvc,
        name: `${first_name} ${last_name}`
      }
    } as any);

    // Create customer
    const customer = await stripe.customers.create({
      email: email,
      description: 'Kitab Cloud Plan',
      source: token.id,
    });

    // Create charge
    await stripe.charges.create({
      amount: 200,
      currency: 'usd',
      customer: customer.id,
      description: 'Subscription Plan',
    });

    // Update user with trial information
    await pool.execute(
      'UPDATE users SET stripe_customer_id = ?, trial_ends_at = DATE_ADD(NOW(), INTERVAL 14 DAY), trial_status = ? WHERE id = ?',
      [customer.id, 'active', userId]
    );

    res.json({
      message: 'Trial started. No payment yet.',
      customer_id: customer.id
    });

  } catch (error: any) {
    console.error('Trial initiation failed:', error);
    res.status(500).json({
      error: 'Stripe error: ' + error.message
    });
  }
});

// Cancel trial
router.post('/cancel-trial', requireJwt, async (req: any, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user by email
    const [users] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    ) as any[];

    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].id;

    // Update user trial status
    await pool.execute(
      'UPDATE users SET trial_status = ? WHERE id = ?',
      ['cancelled', userId]
    );

    res.json({ message: 'Trial cancelled.' });

  } catch (error: any) {
    console.error('Trial cancellation failed:', error);
    res.status(500).json({
      error: 'Server error: ' + error.message
    });
  }
});

// ==================== CANCEL SUBSCRIPTION ====================
router.post('/cancel-subscription', requireJwt, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.sub;
    const { subscription_id, reason } = req.body;

    if (!subscription_id) {
      return res.status(400).json({ success: false, message: 'Subscription ID is required' });
    }

    // Check if subscription exists and belongs to user
    const [subscriptions]: any = await pool.query(
      'SELECT * FROM subscriptions WHERE id = ? AND user_id = ?',
      [subscription_id, userId]
    );

    if (subscriptions.length === 0) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    const subscription = subscriptions[0];

    // If it's a Stripe subscription, cancel it via Stripe API
    if (subscription.type === 'stripe' && subscription.subscription_id) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        
        // Cancel the subscription in Stripe
        await stripe.subscriptions.cancel(subscription.subscription_id, {
          cancellation_details: {
            comment: reason || 'User requested cancellation',
            feedback: 'other'
          }
        });

        // Update subscription status in database
        await pool.execute(
          'UPDATE subscriptions SET payment_status = ?, updated_at = NOW() WHERE id = ?',
          ['Cancelled', subscription_id]
        );

        // Update user subscription status
        await pool.execute(
          'UPDATE users SET subscription_status = 0, updated_at = NOW() WHERE id = ?',
          [userId]
        );

        return res.json({ 
          success: true, 
          message: 'Subscription cancelled successfully',
          cancelled_at: new Date().toISOString()
        });
      } catch (stripeError: any) {
        console.error('Stripe cancellation error:', stripeError);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to cancel subscription with payment provider: ' + stripeError.message 
        });
      }
    } else {
      // For non-Stripe subscriptions, just update the database
      await pool.execute(
        'UPDATE subscriptions SET payment_status = ?, updated_at = NOW() WHERE id = ?',
        ['Cancelled', subscription_id]
      );

      // Update user subscription status
      await pool.execute(
        'UPDATE users SET subscription_status = 0, updated_at = NOW() WHERE id = ?',
        [userId]
      );

      return res.json({ 
        success: true, 
        message: 'Subscription cancelled successfully',
        cancelled_at: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get transactions (placeholder)
router.get('/get_transaction', requireJwt, async (req: any, res) => {
  try {
    // This would need to be implemented based on your specific requirements
    res.json({ message: 'Transaction endpoint - implementation needed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// MPGS payment (placeholder)
router.post('/create-mpgs-payment', requireJwt, async (req: any, res) => {
  res.status(501).json({ message: 'MPGS payment not implemented' });
});

// M-Pesa endpoints (placeholders)
router.post('/subscribe_mpesa', requireJwt, async (req: any, res) => {
  res.status(501).json({ message: 'M-Pesa subscription not implemented' });
});

router.post('/check_mpesa_status', requireJwt, async (req: any, res) => {
  res.status(501).json({ message: 'M-Pesa status check not implemented' });
});

router.post('/mpesa/callbackurl', async (req: any, res) => {
  res.status(501).json({ message: 'M-Pesa callback not implemented' });
});

router.post('/payment', requireJwt, async (req: any, res) => {
	try {
		const account_no = req.body?.account_no;
		if (!account_no) return res.status(400).json({ status: false, message: 'account_no required' });
		const payload = {
			schemaVersion: '1.0',
			requestId: 'unique_requestid',
			timestamp: 'client_timestamp',
			channelName: 'WEB',
			serviceName: 'API_PREAUTHORIZE',
			serviceParams: {
				merchantUid: 'M0913510',
				apiUserId: '1007122',
				apiKey: 'API-1067578524AHX',
				paymentMethod: 'MWALLET_ACCOUNT',
				payerInfo: { accountNo: account_no },
				transactionInfo: { referenceId: 'RF123444', invoiceId: 'INV1280215', amount: '3', currency: 'USD', description: 'test direct purchase' },
			},
		};
		const r = await fetch('https://api.waafipay.net/asm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
		const response: any = await r.json();
		if (response?.responseCode === '2001') {
			const transactionId = response?.params?.transactionId;
			if (!transactionId) return res.status(500).json({ status: false, message: 'Missing transactionId' });
			const commitPayload = {
				schemaVersion: '1.0',
				requestId: 'unique_requestid',
				timestamp: 'client_timestamp',
				channelName: 'WEB',
				serviceName: 'API_PREAUTHORIZE_COMMIT',
				serviceParams: {
					merchantUid: 'M0913510',
					apiUserId: '1007122',
					apiKey: 'API-1067578524AHX',
					paymentMethod: 'MWALLET_ACCOUNT',
					transactionId,
					description: 'PREAUTH Commited',
				},
			};
			const r2 = await fetch('https://api.waafipay.net/asm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(commitPayload) });
			const c = await r2.json();
			if (c?.responseCode === '2001') {
				const id = req.user?.id || req.user?.sub;
				await pool.execute(
					`INSERT INTO subscriptions (user_id, subscription_id, customer, plan_id, subscription_start, subscription_end, plan_amount, currency, \`interval\`, payment_status, type, comments, created_at, updated_at)
					 VALUES (?, ?, '', '', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 3, 'Usd', '', 'Success', 'wafipay', 'Ok', NOW(), NOW())`,
					[id, transactionId]
				);
				return res.json({ status: true, message: 'Subscribed Successfully' });
			}
			return res.status(500).json({ status: false, message: c });
		}
		return res.status(500).json({ status: false, message: response });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

export default router;
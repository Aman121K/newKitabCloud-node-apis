// node-api/src/routes/payments.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';
/*
Payments API – subscriptions and payment flows
- POST /api/stripe/webhook: Stripe webhook endpoint (not implemented yet).
- POST /api/create-subscription: Create Stripe subscription (stub).
- POST /api/create-setup-intent: Create Stripe setup intent (stub).
- POST /api/create-mpgs-payment: MPGS payment initiation (stub).
- POST /api/subscribe: Generic subscribe (stub).
- POST /api/subscribe_mpesa: M-Pesa subscribe (stub).
- POST /api/check_mpesa_status: Check M-Pesa payment status (stub).
- POST /api/payment: WAAFI direct purchase demo – preauthorize + commit, creates 30-day subscription.
Notes: Provide real credentials and success/cancel URLs to fully implement Stripe/MPGS/M-Pesa.
*/
const router = Router();
router.post('/stripe/webhook', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
router.post('/create-subscription', requireJwt, (_req, res) => res.status(501).json({ message: 'Not implemented' }));
router.post('/create-setup-intent', requireJwt, (_req, res) => res.status(501).json({ message: 'Not implemented' }));
router.post('/create-mpgs-payment', requireJwt, (_req, res) => res.status(501).json({ message: 'Not implemented' }));
router.post('/subscribe', requireJwt, (_req, res) => res.status(501).json({ message: 'Not implemented' }));
router.post('/subscribe_mpesa', requireJwt, (_req, res) => res.status(501).json({ message: 'Not implemented' }));
router.post('/check_mpesa_status', requireJwt, (_req, res) => res.status(501).json({ message: 'Not implemented' }));
router.post('/payment', requireJwt, async (req, res) => {
    try {
        const account_no = req.body?.account_no;
        if (!account_no)
            return res.status(400).json({ status: false, message: 'account_no required' });
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
        const response = await r.json();
        if (response?.responseCode === '2001') {
            const transactionId = response?.params?.transactionId;
            if (!transactionId)
                return res.status(500).json({ status: false, message: 'Missing transactionId' });
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
                await pool.execute(`INSERT INTO subscriptions (user_id, subscription_id, customer, plan_id, subscription_start, subscription_end, plan_amount, currency, \`interval\`, payment_status, type, comments, created_at, updated_at)
					 VALUES (?, ?, '', '', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 3, 'Usd', '', 'Success', 'wafipay', 'Ok', NOW(), NOW())`, [id, transactionId]);
                return res.json({ status: true, message: 'Subscribed Successfully' });
            }
            return res.status(500).json({ status: false, message: c });
        }
        return res.status(500).json({ status: false, message: response });
    }
    catch (e) {
        return res.status(500).json({ status: false, message: e?.message || 'Internal error' });
    }
});
export default router;

import auth from '../routes/auth';
import users from '../routes/users';
import home from '../routes/home';
import books from '../routes/books';
import media from '../routes/media';
import follow from '../routes/follow';
import payments from '../routes/payments';
export function registerRoutes(app) {
    app.use('/api', payments);
    app.use('/api', auth);
    app.use('/api', users);
    app.use('/api', home);
    app.use('/api', books);
    app.use('/api', media);
    app.use('/api', follow);
}

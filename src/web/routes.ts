import type { Express } from 'express';
import auth from '../routes/auth';
import users from '../routes/users';
import home from '../routes/home';
import books from '../routes/books';
import media from '../routes/media';
import follow from '../routes/follow';
import payments from '../routes/payments';
import admin from '../routes/admin';
import adminExtended from '../routes/admin-extended';
import utils from '../routes/utils';
import categories from '../routes/categories';
import languages from '../routes/languages';
import readers from '../routes/readers';
import authors from '../routes/authors';
import publishers from '../routes/publishers';
import booksResource from '../routes/books-resource';
import videosResource from '../routes/videos-resource';
import podcastResource from '../routes/podcast-resource';

export function registerRoutes(app: Express) {
	app.use('/api', payments);
	app.use('/api', auth);
	app.use('/api', users);
	app.use('/api', home);
	app.use('/api', books);
	app.use('/api', media);
	app.use('/api', follow);
	app.use('/api', utils);
	app.use('/api/category', categories);
	app.use('/api/language', languages);
	app.use('/api/reader', readers);
	app.use('/api/author', authors);
	app.use('/api/publisher', publishers);
	app.use('/api/books', booksResource);
	app.use('/api/videos', videosResource);
	app.use('/api/podcast', podcastResource);
	app.use('/api/admin', admin);
	app.use('/api/admin', adminExtended);
}







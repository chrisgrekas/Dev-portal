// Τα tests τρέχουν σε ΞΕΧΩΡΙΣΤΗ βάση (TEST_DATABASE_URL) ώστε να μη χαλάνε τα dev δεδομένα.
import 'dotenv/config';
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL in .env to run tests');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-secret';

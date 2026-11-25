import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';
import { useTitle } from '../lib/hooks';

export default function NotFound() {
  useTitle('Δεν βρέθηκε');
  return (
    <Empty title="Η σελίδα δεν βρέθηκε">
      <Link to="/">Αναζήτηση πελάτη</Link>
    </Empty>
  );
}

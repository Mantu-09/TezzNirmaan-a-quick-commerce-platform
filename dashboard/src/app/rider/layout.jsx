import '../styles/globals.css';
import RiderShell from '../components/rider/RiderShell';

export const metadata = {
  title: 'My Deliveries — TezzNirmaan',
};

export default function RiderLayout({ children }) {
  return <RiderShell>{children}</RiderShell>;
}

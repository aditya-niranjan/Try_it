import { redirect } from 'next/navigation';

/**
 * Root page — redirects to /try-on (the only page in Milestone 1).
 */
export default function Home() {
  redirect('/try-on');
}

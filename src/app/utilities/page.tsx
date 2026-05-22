import { UtilitiesView } from "./utilities-view";

// The Utilities page is a client-rendered analytics view. For the mockup it
// reads from a local sample-data file; when the backend is wired this becomes
// an async server component that fetches from Supabase and passes the data in.
export default function UtilitiesPage() {
  return <UtilitiesView />;
}

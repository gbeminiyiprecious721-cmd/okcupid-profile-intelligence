import { Link } from "react-router";
import { PageHeader } from "../components/ui/PageHeader";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" lead="There is no page at this address. Check the link, or go back to the start." />
      <Link to="/" className="font-semibold">
        Go to Home
      </Link>
    </>
  );
}

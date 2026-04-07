import { useEffect } from "react";
import { useClerk } from "@clerk/clerk-react";

import { FullPageProgress } from "components";

export default function Logout() {
	const { signOut } = useClerk();

	useEffect(() => {
		signOut({ redirectUrl: "/" });
	}, []);

	return <FullPageProgress />;
}

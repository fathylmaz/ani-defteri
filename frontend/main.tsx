import { createRoot } from "react-dom/client";
import Journal from "./app/journal";
import AccountPage from "./app/account";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/literata";
import "@fontsource-variable/literata/wght-italic.css";
import "./app/globals.css";
createRoot(document.getElementById("root")!).render(
  location.pathname === "/hesap" ? <AccountPage /> : <Journal />,
);

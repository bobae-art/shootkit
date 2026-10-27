import React from "react";
import ReactDOM from "react-dom/client";
import ShootRegister from "./prototype/register/shoot-kit/ShootRegister";
import { setPretendard } from "./prototype/fonts/pretendard";
import "./base.css";

setPretendard(true);

// Root and the previous ?register=shootkit link both open the same original kit.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ShootRegister />
  </React.StrictMode>,
);

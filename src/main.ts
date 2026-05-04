import { RenderingLabApp } from "./app";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

const app = new RenderingLabApp(root);
app.start();

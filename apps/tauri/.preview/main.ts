import "../src/app.css";
import { mount } from "svelte";
import App from "../src/App.svelte";
if (location.hash === "#bar") document.body.classList.add("bar");
if (location.search.includes("bg")) document.documentElement.style.background = "radial-gradient(circle at 30% 20%, #2b3350, #10121c)";
mount(App, { target: document.getElementById("app")! });

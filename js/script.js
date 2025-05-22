/**
 * @copyright scovings 2025
 * @author Daniel Tait <weedanieltait@gmail.com>
 */

"use strict";


/**
 * Light and dark mode
 */

const /** {NodeElement} */ $themebtn = document.querySelector("[data-theme-btn]");
const /** {NodeElement} */ $HTML = document.documentElement;
let /** {Boolean | String} */ isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

if(sessionStorage.getItem("theme")) {
  $HTML.dataset.theme = sessionStorage.getItem("theme");
} else {
  $HTML.dataset.theme = isDark ? "dark" : "light";
}

const changeTheme = () => {

  $HTML.dataset.theme = sessionStorage.getItem("theme") === "light" ? "dark" : "light";
  sessionStorage.setItem("theme", $HTML.dataset.theme);

}

$themebtn.addEventListener("click", changeTheme);
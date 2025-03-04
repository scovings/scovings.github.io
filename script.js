document.addEventListener("DOMContentLoaded", function () {
  const introText = "Scovings";
  let index = 0;
  const introElement = document.getElementById("intro");

  function typeEffect() {
      if (index < introText.length) {
          introElement.innerHTML += introText.charAt(index);
          index++;
          setTimeout(typeEffect, 100);
      } else {
          setTimeout(() => {
              introElement.classList.add("fade-out");
          }, 1000);
      }
  }

  introElement.innerHTML = ""; 
  typeEffect();
});

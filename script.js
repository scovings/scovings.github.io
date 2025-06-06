/**
 * @copyright scovings 2025
 */

// Matrix effect
function createMatrix() {
  const matrix = document.getElementById("matrix");
  const chars = "01";

  for (let i = 0; i < 50; i++) {
    const char = document.createElement("div");
    char.className = "matrix-char";
    char.textContent = chars[Math.floor(Math.random() * chars.length)];
    char.style.left = Math.random() * 100 + "vw";
    char.style.animationDelay = Math.random() * 3 + "s";
    char.style.animationDuration = Math.random() * 3 + 2 + "s";
    matrix.appendChild(char);

    setTimeout(() => char.remove(), 5000);
  }
}

setInterval(createMatrix, 1000);

// Floating elements
function createFloater() {
  const floater = document.createElement("div");
  floater.className = "float-element";
  floater.style.left = Math.random() * 100 + "vw";
  floater.style.animationDuration = Math.random() * 4 + 4 + "s";
  document.body.appendChild(floater);

  setTimeout(() => floater.remove(), 8000);
}

setInterval(createFloater, 800);

// Project hover effects
document.querySelectorAll(".project").forEach((project) => {
  project.addEventListener("mouseenter", () => {
    project.classList.add("glow");
  });

  project.addEventListener("mouseleave", () => {
    project.classList.remove("glow");
  });
});

// Dynamic stats update
function updateStats() {
  const commits = document.querySelector(".stat-line:nth-child(2) .stat-value");
  const current = parseInt(commits.textContent.replace("k", "")) * 1000;
  commits.textContent =
    Math.floor(((current + Math.random() * 10) / 1000) * 10) / 10 + "k";
}

setInterval(updateStats, 5000);

// Smooth scroll reveal
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
    }
  });
});

document.querySelectorAll(".project").forEach((project, i) => {
  project.style.opacity = "0";
  project.style.transform = "translateY(20px)";
  project.style.transition = `all 0.6s ease ${i * 0.1}s`;
  observer.observe(project);
});

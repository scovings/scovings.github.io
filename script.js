document.addEventListener("DOMContentLoaded", function () {
    const buttons = document.querySelectorAll(".filter-btn");
    const projects = document.querySelectorAll(".project");

    buttons.forEach(button => {
        button.addEventListener("click", function () {
            let filter = this.getAttribute("data-filter");

            buttons.forEach(btn => btn.classList.remove("active"));
            this.classList.add("active");

            projects.forEach(project => {
                if (filter === "all" || project.getAttribute("data-category") === filter) {
                    project.classList.add("show");
                } else {
                    project.classList.remove("show");
                }
            });
        });
    });

    // Show all projects by default
    document.querySelector(".filter-btn[data-filter='all']").click();
});

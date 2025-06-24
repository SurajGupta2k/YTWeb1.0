// This sets up the floating action buttons, like refresh and scroll-to-top.
document.addEventListener('DOMContentLoaded', () => {
    const refreshButton = document.getElementById('refresh-button');
    const scrollToTopButton = document.getElementById('scroll-to-top');

    // When you click refresh, it spins for a moment and then reloads the page.
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            refreshButton.classList.add('refreshing');
            setTimeout(() => {
                window.location.reload();
            }, 500);
        });
    }

    // This handles the scroll-to-top button.
    if (scrollToTopButton) {
        // It only shows up after you've scrolled down a bit.
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollToTopButton.classList.add('visible');
            } else {
                scrollToTopButton.classList.remove('visible');
            }
        });

        // Clicking it zips you back to the top of the page.
        scrollToTopButton.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
});
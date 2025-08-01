// This script handles the light and dark theme for the website.

const themeToggle = document.getElementById('theme-toggle');
const body = document.body;
const sunIcon = document.getElementById('theme-icon-sun');
const moonIcon = document.getElementById('theme-icon-moon');

// Figures out which theme to use. It first checks for a saved preference
// in local storage. If there isn't one, it falls back to the user's
// system-level preference.
const getPreferredTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        return savedTheme;
    }
    // Default to light mode, ignoring system preference.
    return 'light';
};

// Applies the chosen theme. This involves adding/removing the 'dark' class,
// toggling the sun/moon icons, and saving the theme choice to local storage
// so it persists across visits.
const setTheme = (theme) => {
    if (theme === 'dark') {
        body.classList.add('dark');
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    } else {
        body.classList.remove('dark');
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    }
    localStorage.setItem('theme', theme);
};

// Set the correct theme as soon as the page loads.
setTheme(getPreferredTheme());

// Wires up the theme toggle button to switch between light and dark modes.
themeToggle.addEventListener('click', () => {
    const isDark = body.classList.contains('dark');
    setTheme(isDark ? 'light' : 'dark');
});

// The event listener for system preference changes has been removed to enforce the default.
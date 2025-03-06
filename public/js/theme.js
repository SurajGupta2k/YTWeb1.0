// Hey! This handles dark/light mode for the site

// Grab our theme toggle button and the html element
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

// Check what theme the user wants
const getPreferredTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        return savedTheme;
    }
    // No saved preference? Use their system theme
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// Switch the theme around
const setTheme = (theme) => {
    if (theme === 'dark') {
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
    }
    // Save it for next time
    localStorage.setItem('theme', theme);
};

// Use the right theme when loading
setTheme(getPreferredTheme());

// Handle theme button clicks
themeToggle.addEventListener('click', () => {
    const isDark = html.classList.contains('dark');
    setTheme(isDark ? 'light' : 'dark');
});

// Keep an eye on system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
    }
}); 
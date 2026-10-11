// ==============================================
//  THEME TOGGLE
// ==============================================
(function () {
    const toggle = document.getElementById('theme-toggle');
    const icon = toggle.querySelector('i');
    const html = document.documentElement;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    // Keep the browser UI colour in step with the page background.
    function syncThemeColor() {
        if (themeColor) themeColor.content = getComputedStyle(html).getPropertyValue('--bg').trim();
    }

    // Load saved preference (default = dark, no attribute)
    let saved;
    try { saved = localStorage.getItem('theme'); } catch (_) { /* Storage may be unavailable. */ }
    if (saved === 'light') {
        html.setAttribute('data-theme', 'light');
        icon.className = 'fas fa-moon';
        syncThemeColor();
    }

    toggle.addEventListener('click', function () {
        const isLight = html.getAttribute('data-theme') === 'light';
        if (isLight) {
            html.removeAttribute('data-theme');
            try { localStorage.setItem('theme', 'dark'); } catch (_) { /* Keep the toggle working. */ }
            icon.className = 'fas fa-sun';
        } else {
            html.setAttribute('data-theme', 'light');
            try { localStorage.setItem('theme', 'light'); } catch (_) { /* Keep the toggle working. */ }
            icon.className = 'fas fa-moon';
        }
        syncThemeColor();
    });
})();

// ==============================================
//  MOBILE NAVIGATION
// ==============================================
(function () {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    const overlay = document.getElementById('mobile-overlay');

    function closeMenu() {
        navLinks.classList.remove('open');
        overlay.classList.remove('active');
    }

    hamburger.addEventListener('click', function () {
        const isOpen = navLinks.classList.contains('open');
        if (isOpen) {
            closeMenu();
        } else {
            navLinks.classList.add('open');
            overlay.classList.add('active');
        }
    });

    overlay.addEventListener('click', closeMenu);

    navLinks.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', closeMenu);
    });
})();

// ==============================================
//  SCROLL REVEAL & ACTIVE NAV
// ==============================================
// Content stays visible when JavaScript or IntersectionObserver is unavailable.
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(function (el) {
        revealObserver.observe(el);
    });
    document.documentElement.classList.add('reveal-enabled');
}

// Active nav highlighting (scroll-based, single winner)
const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');
const sectionEls = document.querySelectorAll('section[id]');

function updateActiveNav() {
    var scrollY = window.scrollY + 120;
    var current = '';
    sectionEls.forEach(function (section) {
        if (section.offsetTop <= scrollY) {
            current = section.id;
        }
    });
    navAnchors.forEach(function (a) {
        if (a.getAttribute('href') === '#' + current) {
            a.classList.add('active');
        } else {
            a.classList.remove('active');
        }
    });
}

let navFramePending = false;
window.addEventListener('scroll', function () {
    if (navFramePending) return;
    navFramePending = true;
    requestAnimationFrame(function () {
        navFramePending = false;
        updateActiveNav();
    });
}, { passive: true });
updateActiveNav();

// All gallery overlays share one scroll lock, including nested lightboxes.
const openGalleryModals = new Set();
let previousBodyOverflow;

function setGalleryModal(id, display) {
    const wasOpen = openGalleryModals.size > 0;
    if (display === 'none') {
        openGalleryModals.delete(id);
    } else {
        if (!wasOpen) previousBodyOverflow = document.body.style.overflow;
        openGalleryModals.add(id);
    }
    document.getElementById(id).style.display = display;
    if (openGalleryModals.size > 0) document.body.style.overflow = 'hidden';
    else if (wasOpen) document.body.style.overflow = previousBodyOverflow;
}

// ==============================================
//  LIGHTBOX (Full zoom/drag preserved)
// ==============================================
let currentImages = [];
let galleryTimer;
let currentIndex = 0;
let isZoomed = false;
let scale = 1;
let isDragging = false;
let isDragAction = false;
let startX, startY, translateX = 0, translateY = 0;

const lightbox = document.getElementById('lightbox');
const img = document.getElementById('lightbox-img');

function openLightbox(clickedImg) {
    clearTimeout(galleryTimer);
    const gallery = clickedImg.closest('.gallery, .horizontal-gallery, .poster-gallery, .hermes-gallery, .mockup-gallery-grid');
    if (gallery) {
        currentImages = Array.from(gallery.querySelectorAll('img'));
        currentIndex = currentImages.indexOf(clickedImg);
    } else {
        currentImages = [clickedImg];
        currentIndex = 0;
    }
    updateLightboxImage();
    setGalleryModal('lightbox', 'flex');
    resetZoom();
}

function updateLightboxImage() {
    var targetSrc = currentImages[currentIndex].getAttribute('data-full') || currentImages[currentIndex].src;
    img.src = targetSrc;
    img.alt = currentImages[currentIndex].alt || 'Full View';
    img.style.opacity = 1;
}

function navigateGallery(direction) {
    if (!currentImages.length) return;
    clearTimeout(galleryTimer);
    currentIndex += direction;
    if (currentIndex < 0) currentIndex = currentImages.length - 1;
    if (currentIndex >= currentImages.length) currentIndex = 0;
    img.style.opacity = 0.5;
    galleryTimer = setTimeout(function () { updateLightboxImage(); resetZoom(); }, 150);
}

document.addEventListener('keydown', function (e) {
    if (lightbox.style.display === 'flex') {
        if (e.key === 'ArrowLeft') navigateGallery(-1);
        if (e.key === 'ArrowRight') navigateGallery(1);
        if (e.key === 'Escape') closeLightbox(null, true);
    }
});

function closeLightbox(e, force) {
    if (force || (e && (e.target.id === 'lightbox' || e.target.id === 'lightbox-content'))) {
        clearTimeout(galleryTimer);
        setGalleryModal('lightbox', 'none');
        resetZoom();
    }
}

// Mouse-aware zoom
img.addEventListener('wheel', function (e) {
    e.preventDefault();
    var delta = e.deltaY * -0.005;
    var newScale = scale + delta;
    newScale = Math.min(Math.max(1, newScale), 5);
    if (newScale === scale) return;

    var viewCenterX = window.innerWidth / 2;
    var viewCenterY = window.innerHeight / 2;
    var mouseX = e.clientX;
    var mouseY = e.clientY;
    var mouseOffsetFromCenterX = mouseX - viewCenterX - translateX;
    var mouseOffsetFromCenterY = mouseY - viewCenterY - translateY;
    var ratio = newScale / scale;

    translateX -= mouseOffsetFromCenterX * (ratio - 1);
    translateY -= mouseOffsetFromCenterY * (ratio - 1);
    scale = newScale;

    if (scale > 1) {
        isZoomed = true;
        img.style.cursor = 'grab';
    } else {
        resetZoom();
        return;
    }
    updateTransform();
}, { passive: false });

img.addEventListener('click', function (e) {
    e.stopPropagation();
    if (isDragAction) { isDragAction = false; return; }
    if (scale > 1) { resetZoom(); } else { toggleZoomCenter(); }
});

function toggleZoomCenter() {
    isZoomed = true;
    scale = 2.0;
    img.style.cursor = 'grab';
    updateTransform();
}

function resetZoom() {
    isDragging = false;
    isDragAction = false;
    startX = startY = 0;
    initialDistance = null;
    initialScale = 1;
    touchStartX = 0;
    isZoomed = false;
    scale = 1;
    translateX = 0;
    translateY = 0;
    img.style.cursor = 'zoom-in';
    img.style.transform = 'translate(0px, 0px) scale(1)';
}

function updateTransform() {
    img.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
}

// Drag (Mouse)
img.addEventListener('mousedown', function (e) {
    if (scale <= 1) return;
    isDragging = true;
    isDragAction = false;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    img.style.cursor = 'grabbing';
    e.preventDefault();
});

window.addEventListener('mouseup', function () {
    if (isDragging) { isDragging = false; img.style.cursor = 'grab'; }
});

window.addEventListener('mousemove', function (e) {
    if (!isDragging || scale <= 1) return;
    e.preventDefault();
    isDragAction = true;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
});

// Touch Events for Mobile (Pinch-to-zoom, Swipe, Pan)
let initialDistance = null;
let initialScale = 1;
let touchStartX = 0;

img.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
        initialDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        initialScale = scale;
        isDragging = false;
    } else if (e.touches.length === 1) {
        isDragging = true;
        isDragAction = false;
        touchStartX = e.touches[0].clientX;
        if (scale > 1) {
            startX = e.touches[0].clientX - translateX;
            startY = e.touches[0].clientY - translateY;
        }
    }
}, { passive: false });

img.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
        e.preventDefault(); 
        const currentDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (initialDistance) {
            let newScale = initialScale * (currentDistance / initialDistance);
            scale = Math.min(Math.max(1, newScale), 5);
            if (scale === 1) {
                translateX = 0;
                translateY = 0;
            }
            updateTransform();
        }
    } else if (e.touches.length === 1 && isDragging) {
        if (scale > 1) {
            e.preventDefault();
            isDragAction = true;
            translateX = e.touches[0].clientX - startX;
            translateY = e.touches[0].clientY - startY;
            updateTransform();
        }
    }
}, { passive: false });

img.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) {
        initialDistance = null;
    }
    if (e.changedTouches.length === 1 && isDragging && scale === 1) {
        const diffX = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diffX) > 50) {
            if (diffX > 0) navigateGallery(-1);
            else navigateGallery(1);
        }
    }
    isDragging = false;
});

// ==============================================
//  MOCKUP GALLERIES
// ==============================================
function openMockupGallery() {
    setGalleryModal('mockup-lightbox', 'flex');
}
function closeMockupGallery() {
    setGalleryModal('mockup-lightbox', 'none');
}
function closeMockupOnBackground(e) {
    if (e.target.id === 'mockup-lightbox') closeMockupGallery();
}

function openHermesMockupGallery() {
    setGalleryModal('hermes-mockup-lightbox', 'flex');
}
function closeHermesMockupGallery() {
    setGalleryModal('hermes-mockup-lightbox', 'none');
}
function closeHermesMockupOnBackground(e) {
    if (e.target.id === 'hermes-mockup-lightbox') closeHermesMockupGallery();
}

function viewMockupSingle(el) { openLightbox(el); }

// ==============================================
//  PANORAMA
// ==============================================
let viewer;
let panoramaLibraryPromise;
let panoramaRequest = 0;
const panoramaStatus = document.getElementById('panorama-status');

// Download the 360° library only when a panorama is requested.
function loadPanoramaLibrary() {
    if (!panoramaLibraryPromise) {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
        stylesheet.integrity = 'sha384-02yn80EH0cF+s23taAmuhEZ04p3CTbQvV0QZMr2reUxajpfvcLNKlzsPkZwx14mf';
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';
        script.integrity = 'sha384-S5+w/JlcNAOymqXGNrvzn2F++XsaHTJdex6KE5VbKryfFgqJiRUJOgOkUqaiOZTf';
        // Subresource Integrity requires CORS requests; a changed CDN file fails to load.
        stylesheet.crossOrigin = script.crossOrigin = 'anonymous';
        panoramaLibraryPromise = Promise.all([stylesheet, script].map(function (asset) {
            return new Promise(function (resolve, reject) {
                asset.onload = resolve;
                asset.onerror = function () { reject(new Error('Panorama library unavailable')); };
                document.head.appendChild(asset);
            });
        })).catch(function (error) {
            stylesheet.remove();
            script.remove();
            panoramaLibraryPromise = null;
            throw error;
        });
    }
    return panoramaLibraryPromise;
}

function openPanoramaGallery() {
    setGalleryModal('panorama-gallery-modal', 'flex');
}
function closePanoramaGallery() {
    panoramaRequest++;
    panoramaStatus.textContent = '';
    setGalleryModal('panorama-gallery-modal', 'none');
}
function closePanoramaGalleryOnBackground(e) {
    if (e.target.id === 'panorama-gallery-modal') closePanoramaGallery();
}

async function openPanoramaViewer(imagePath) {
    const request = ++panoramaRequest;
    panoramaStatus.textContent = 'Loading panorama…';
    try {
        await loadPanoramaLibrary();
        if (request !== panoramaRequest) return;
        if (viewer) viewer.destroy();
        setGalleryModal('panorama-viewer-modal', 'block');
        viewer = pannellum.viewer('panorama-360-view', {
            "type": "equirectangular",
            "panorama": imagePath,
            "autoLoad": true,
            "compass": false,
            "showControls": true
        });
        setGalleryModal('panorama-gallery-modal', 'none');
        panoramaStatus.textContent = '';
    } catch (error) {
        if (request !== panoramaRequest) return;
        setGalleryModal('panorama-viewer-modal', 'none');
        panoramaStatus.textContent = 'Unable to load the panorama. Please try again.';
    }
}

function closePanoramaViewer() {
    setGalleryModal('panorama-viewer-modal', 'none');
    setGalleryModal('panorama-gallery-modal', 'flex');
    if (viewer) { viewer.destroy(); viewer = null; }
}

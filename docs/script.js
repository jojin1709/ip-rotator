// Create particles
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.width = (Math.random() * 4 + 2) + 'px';
        particle.style.height = particle.style.width;
        container.appendChild(particle);
    }
}

// Typewriter effect
const commands = [
    'node rotator.js status',
    'node rotator.js check',
    'node rotator.js start --mode tor',
    'node rotator.js security --dns',
    'node rotator.js mac --random',
    'node rotator.js ua --rotate',
    'node rotator.js dashboard'
];

const outputs = [
    `<span class="success">  ✓ Status: Online</span>\n<span class="info">  Mode: TOR | Rotations: 0</span>`,
    `<span class="success">  ✓ DNS Leak: Protected</span>\n<span class="success">  ✓ WebRTC: Protected</span>\n<span class="success">  ✓ Connectivity: Online</span>`,
    `<span class="success">  ✓ Tor connected</span>\n<span class="info">  Rotation started! Interval: 60s</span>`,
    `<span class="success">  ✓ No DNS leaks detected</span>`,
    `<span class="success">  ✓ MAC randomized: 02:4a:7b:c8:91:ef</span>`,
    `<span class="success">  ✓ New User-Agent assigned</span>`,
    `<span class="success">  ✓ Dashboard: http://localhost:8080</span>`
];

let cmdIndex = 0;
let charIndex = 0;
let isDeleting = false;
let isPaused = false;

function typeWriter() {
    const typewriter = document.getElementById('typewriter');
    const output = document.getElementById('terminalOutput');
    
    if (!typewriter || !output) return;
    
    const currentCmd = commands[cmdIndex];
    
    if (isPaused) return;
    
    if (!isDeleting) {
        typewriter.textContent = currentCmd.substring(0, charIndex + 1);
        charIndex++;
        
        if (charIndex === currentCmd.length) {
            isPaused = true;
            output.innerHTML = outputs[cmdIndex];
            
            setTimeout(() => {
                isPaused = false;
                isDeleting = true;
                typeWriter();
            }, 2500);
            return;
        }
        
        setTimeout(typeWriter, 50 + Math.random() * 40);
    } else {
        output.innerHTML = '';
        typewriter.textContent = currentCmd.substring(0, charIndex - 1);
        charIndex--;
        
        if (charIndex === 0) {
            isDeleting = false;
            cmdIndex = (cmdIndex + 1) % commands.length;
            setTimeout(typeWriter, 500);
            return;
        }
        
        setTimeout(typeWriter, 20);
    }
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const tab = this.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        
        this.classList.add('active');
        document.getElementById('panel-' + tab).classList.add('active');
    });
});

// Copy code
function copyCode(btn) {
    const codeBlock = btn.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!';
        btn.style.background = '#22c55e';
        btn.style.color = 'white';
        btn.style.borderColor = '#22c55e';
        
        setTimeout(() => {
            btn.textContent = 'Copy';
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    });
}

// Mobile menu
function toggleMenu() {
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.getElementById('hamburger');
    
    navMenu.classList.toggle('active');
    hamburger.classList.toggle('active');
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.getElementById('navMenu').classList.remove('active');
            document.getElementById('hamburger').classList.remove('active');
        }
    });
});

// Intersection Observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    
    setTimeout(typeWriter, 1000);
    
    document.querySelectorAll('.feature-card, .step-card, .security-card, .command-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        observer.observe(el);
    });
    
    // Animate stat numbers
    document.querySelectorAll('.stat-number').forEach(stat => {
        const target = parseInt(stat.dataset.target);
        const duration = 2000;
        const start = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(target * easeOut);
            
            stat.textContent = current + (target === 100 ? '%' : '');
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        const statObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animate();
                statObserver.disconnect();
            }
        }, { threshold: 0.5 });
        
        statObserver.observe(stat);
    });
});

// Feature card tilt effect
document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;
        
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
    });
});

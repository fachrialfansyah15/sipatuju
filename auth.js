// Authentication System for Road Monitor Palu

class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.userId = null;
        this.supabase = window.supabase?.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        this.init();
    }

    init() {
        this.setupEventListeners();
        // Only check auth status on login page, other pages will check manually
        if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
            this.checkAuthStatus();
        } else {
            this.loadUserData();
        }
    }

    setupEventListeners() {
        // Login form submission
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Register link
        const registerLink = document.getElementById('registerLink');
        if (registerLink) {
            registerLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showRegisterForm();
            });
        }

        // Forgot password link
        const forgotPassword = document.getElementById('forgotPassword');
        if (forgotPassword) {
            forgotPassword.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForgotPassword();
            });
        }

        // User dropdown functionality
        this.setupUserDropdown();
    }

    setupUserDropdown() {
        const dropdownBtn = document.querySelector('.dropdown-btn');
        const dropdownContent = document.querySelector('.dropdown-content');
        const logoutLink = document.getElementById('logoutLink');

        if (dropdownBtn && dropdownContent) {
            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownContent.classList.toggle('show');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.user-profile')) {
                    dropdownContent.classList.remove('show');
                }
            });

            // Logout functionality
            if (logoutLink) {
                logoutLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.logout();
                });
            }
        }

        // Show/hide admin navigation
        this.toggleAdminNavigation();
    }

    toggleAdminNavigation() {
        const adminNavItems = document.querySelectorAll('.admin-only');
        adminNavItems.forEach(item => {
            if (this.isAdmin) {
                item.classList.add('show');
            } else {
                item.classList.remove('show');
            }
        });
    }

    switchTab(tab) {
        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Add active class to selected tab
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        // Update form based on tab
        const form = document.getElementById('loginForm');
        if (tab === 'admin') {
            form.innerHTML = `
                <div class="form-group">
                    <label for="username">Admin Username</label>
                    <input type="text" id="username" name="username" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Admin Password</label>
                    <input type="password" id="password" name="password" required>
                </div>

                <div class="form-group">
                    <label for="adminCode">Admin Code</label>
                    <input type="text" id="adminCode" name="adminCode" placeholder="Enter admin verification code">
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="remember">
                        <span class="checkmark"></span>
                        Remember me
                    </label>
                </div>

                <button type="submit" class="login-btn">
                    <i class="fas fa-sign-in-alt"></i>
                    Admin Login
                </button>
            `;
        } else {
            form.innerHTML = `
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="remember">
                        <span class="checkmark"></span>
                        Remember me
                    </label>
                </div>

                <button type="submit" class="login-btn">
                    <i class="fas fa-sign-in-alt"></i>
                    Login
                </button>
            `;
        }

        // Re-attach event listener
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
    }

    handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const adminCode = document.getElementById('adminCode')?.value;
        const remember = document.getElementById('remember').checked;

        // Simple validation
        if (!username || !password) {
            this.showMessage('Please fill in all required fields', 'error');
            return;
        }

        // Check if it's admin login
        const isAdminLogin = document.querySelector('.tab-btn.active').dataset.tab === 'admin';
        
        if (isAdminLogin && !adminCode) {
            this.showMessage('Please enter admin verification code', 'error');
            return;
        }

        // Simulate authentication
        this.authenticateUser(username, password, adminCode, isAdminLogin, remember);
    }

    authenticateUser(username, password, adminCode, isAdminLogin, remember) {
        // Show loading state
        const submitBtn = document.querySelector('.login-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
        submitBtn.disabled = true;

        (async () => {
            try {
                // Call Supabase Edge Function for authentication
                const endpoint = 'https://cxcxatowzymfpasesrvp.supabase.co/functions/v1/auth-login';
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.SUPABASE_KEY}`
                    },
                    body: JSON.stringify({ username, password })
                });
                const json = await resp.json().catch(() => ({}));

                if (!resp.ok || !json || json.success !== true) {
                    this.showMessage('Username or password incorrect.', 'error');
                    return;
                }

                // Determine role from server response (fallback to username check if missing)
                const role = (json.role === 'admin' || json.role === 'user') ? json.role : (username === 'sipatujuadmin' ? 'admin' : 'user');
                const isAdminUser = role === 'admin';
                const idFromServer = json.id || null;

                // Persist flags
                if (isAdminUser) {
                    localStorage.setItem('isAdmin', 'true');
                    localStorage.removeItem('isUser');
                } else {
                    localStorage.setItem('isUser', 'true');
                    localStorage.removeItem('isAdmin');
                }

                // Keep existing session structure for compatibility
                this.loginSuccess(username, isAdminUser, remember, idFromServer);

                // Redirects per requirement
                if (isAdminUser) {
                    window.location.href = 'dashboard.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
            } catch (err) {
                console.error('[auth] login error', err);
                this.showMessage('Login failed. Please try again.', 'error');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        })();
    }

    loginSuccess(username, isAdmin, remember, id) {
        this.currentUser = username;
        this.isAdmin = isAdmin;
        this.userId = id || null;

        // Store in localStorage if remember is checked
        if (remember) {
            localStorage.setItem('roadMonitorUser', JSON.stringify({
                id: this.userId,
                username: username,
                isAdmin: isAdmin,
                timestamp: Date.now()
            }));
        }

        // Store in sessionStorage always
        sessionStorage.setItem('roadMonitorUser', JSON.stringify({
            id: this.userId,
            username: username,
            isAdmin: isAdmin,
            timestamp: Date.now()
        }));

        this.showMessage('Login successful! Redirecting...', 'success');

        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
    }


    loadUserData() {
        // Check sessionStorage first
        const sessionUser = sessionStorage.getItem('roadMonitorUser');
        if (sessionUser) {
            const userData = JSON.parse(sessionUser);
            // Check if session is still valid (24 hours)
            if (Date.now() - userData.timestamp < 24 * 60 * 60 * 1000) {
                this.currentUser = userData.username;
                this.isAdmin = userData.isAdmin;
                this.userId = userData.id || null;
                return;
            } else {
                sessionStorage.removeItem('roadMonitorUser');
            }
        }

        // Check localStorage
        const localUser = localStorage.getItem('roadMonitorUser');
        if (localUser) {
            const userData = JSON.parse(localUser);
            // Check if remember me is still valid (7 days)
            if (Date.now() - userData.timestamp < 7 * 24 * 60 * 60 * 1000) {
                this.currentUser = userData.username;
                this.isAdmin = userData.isAdmin;
                this.userId = userData.id || null;
                return;
            } else {
                localStorage.removeItem('roadMonitorUser');
            }
        }
    }

    checkAuthStatus() {
        // Check sessionStorage first
        const sessionUser = sessionStorage.getItem('roadMonitorUser');
        if (sessionUser) {
            const userData = JSON.parse(sessionUser);
            // Check if session is still valid (24 hours)
            if (Date.now() - userData.timestamp < 24 * 60 * 60 * 1000) {
                this.currentUser = userData.username;
                this.isAdmin = userData.isAdmin;
                this.userId = userData.id || null;
                // Redirect to dashboard if already logged in and on login page
                if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                    window.location.href = 'dashboard.html';
                }
                return;
            } else {
                sessionStorage.removeItem('roadMonitorUser');
            }
        }

        // Check localStorage
        const localUser = localStorage.getItem('roadMonitorUser');
        if (localUser) {
            const userData = JSON.parse(localUser);
            // Check if remember me is still valid (7 days)
            if (Date.now() - userData.timestamp < 7 * 24 * 60 * 60 * 1000) {
                this.currentUser = userData.username;
                this.isAdmin = userData.isAdmin;
                this.userId = userData.id || null;
                // Redirect to dashboard if already logged in and on login page
                if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                    window.location.href = 'dashboard.html';
                }
                return;
            } else {
                localStorage.removeItem('roadMonitorUser');
            }
        }
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    getUserId() { return this.userId; }


    logout() {
        this.currentUser = null;
        this.isAdmin = false;
        sessionStorage.removeItem('roadMonitorUser');
        localStorage.removeItem('roadMonitorUser');
        window.location.href = 'index.html';
    }

    showMessage(message, type) {
        // Remove existing messages
        const existingMessage = document.querySelector('.auth-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create new message
        const messageDiv = document.createElement('div');
        messageDiv.className = `auth-message ${type}`;
        messageDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i>
            <span>${message}</span>
        `;

        // Add styles
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
            ${type === 'success' ? 'background: #28a745;' : 'background: #dc3545;'}
        `;

        document.body.appendChild(messageDiv);

        // Remove after 5 seconds
        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }, 5000);
    }

    showRegisterForm() {
        this.showRegistrationModal();
    }

    showRegistrationModal() {
        const modal = document.createElement('div');
        modal.className = 'registration-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Buat Akun Baru</h3>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="registrationForm" class="registration-form">
                        <div class="form-group">
                            <label for="regUsername">Username *</label>
                            <input type="text" id="regUsername" name="username" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="regPassword">Kata Sandi *</label>
                            <input type="password" id="regPassword" name="password" required minlength="6">
                        </div>
                        
                        <div class="form-group">
                            <label for="regConfirmPassword">Konfirmasi Kata Sandi *</label>
                            <input type="password" id="regConfirmPassword" name="confirmPassword" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="regEmail">Email *</label>
                            <input type="email" id="regEmail" name="email" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="regFullName">Nama Lengkap *</label>
                            <input type="text" id="regFullName" name="fullName" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="regPhone">Nomor Telepon</label>
                            <input type="tel" id="regPhone" name="phone">
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="regTerms" required>
                                <span class="checkmark"></span>
                                Saya setuju dengan <a href="#" class="terms-link">Syarat Layanan</a> dan <a href="#" class="privacy-link">Kebijakan Privasi</a>
                            </label>
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn-secondary" id="cancelRegistration">Batal</button>
                            <button type="submit" class="btn-primary">Buat Akun</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add styles
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;

        document.body.appendChild(modal);

        // Setup event listeners
        const closeBtn = modal.querySelector('.close');
        const cancelBtn = modal.querySelector('#cancelRegistration');
        const form = modal.querySelector('#registrationForm');

        closeBtn.addEventListener('click', () => {
            modal.remove();
        });

        cancelBtn.addEventListener('click', () => {
            modal.remove();
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegistration(form);
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    handleRegistration(form) {
        const formData = new FormData(form);
        const userData = {
            username: String(formData.get('username') || '').toLowerCase(),
            email: String(formData.get('email') || '').toLowerCase(),
            password: formData.get('password'),
            confirmPassword: formData.get('confirmPassword'),
            fullName: formData.get('fullName'),
            phone: formData.get('phone'),
            isAdmin: false,
            registeredAt: new Date().toISOString()
        };

        // Validation dasar
        if (userData.password !== userData.confirmPassword) {
            this.showMessage('Kata sandi tidak cocok', 'error');
            return;
        }
        if (!userData.password || userData.password.length < 6) {
            this.showMessage('Kata sandi minimal 6 karakter', 'error');
            return;
        }

        // Inisialisasi Supabase client
        const supa = (window.supabase && window.supabase.createClient && window.SUPABASE_URL && window.SUPABASE_KEY)
            ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY)
            : null;
        if (!supa) {
            this.showMessage('Konfigurasi Supabase tidak ditemukan.', 'error');
            return;
        }

        (async () => {
            try {
                // Uniqueness check username/email
                const { data: existUser } = await supa.from('users').select('id').eq('username', userData.username).maybeSingle();
                if (existUser) {
                    this.showMessage('Username sudah digunakan.', 'error');
                    return;
                }
                const { data: existEmail } = await supa.from('users').select('id').eq('email', userData.email).maybeSingle();
                if (existEmail) {
                    this.showMessage('Email sudah terdaftar.', 'error');
            return;
        }

                // Hash password dengan bcryptjs
                const bcryptLib = window.bcrypt || (window.dcodeIO && window.dcodeIO.bcrypt);
                if (!bcryptLib) {
                    this.showMessage('Hashing library tidak tersedia.', 'error');
                    return;
                }
                const salt = bcryptLib.genSaltSync(10);
                const passwordHash = bcryptLib.hashSync(userData.password, salt);

                // Insert ke tabel users
                const payload = {
                    username: userData.username,
            email: userData.email,
                    password_hash: passwordHash,
                    role: 'user',
                    created_at: new Date().toISOString()
                };
                const { error: insertErr } = await supa.from('users').insert([payload]);
                if (insertErr) {
                    // Unique violation (index on lower(username)/lower(email)) → 409/23505
                    const msg = (insertErr.code === '23505' || insertErr.details?.includes('already exists'))
                        ? 'Username atau email sudah terdaftar.'
                        : 'Pendaftaran gagal. Coba lagi.';
                    this.showMessage(msg, 'error');
                    return;
                }

                this.showMessage('Akun berhasil dibuat! Silakan login.', 'success');
                const modal = document.querySelector('.registration-modal');
                if (modal) modal.remove();
            } catch (err) {
                console.error('[register modal] error', err);
                this.showMessage('Pendaftaran gagal. Coba lagi.', 'error');
            }
        })();
    }

    showForgotPassword() {
        this.showMessage('Password reset feature coming soon! Please contact administrator for assistance.', 'info');
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isUserAdmin() {
        return this.isAdmin;
    }
}

// Initialize authentication system
const auth = new AuthSystem();

// Add CSS animations and modal styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .registration-modal .modal-content {
        background: white;
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        animation: modalSlideIn 0.3s ease;
    }

    .registration-modal .modal-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 12px 12px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .registration-modal .modal-header h3 {
        margin: 0;
        font-size: 18px;
    }

    .registration-modal .close {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
    }

    .registration-modal .modal-body {
        padding: 30px;
    }

    .registration-form {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .registration-form .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .registration-form .form-group label {
        font-size: 14px;
        font-weight: 500;
        color: #333;
    }

    .registration-form .form-group input {
        padding: 12px 16px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
        transition: border-color 0.3s ease;
    }

    .registration-form .form-group input:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .registration-form .checkbox-label {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        cursor: pointer;
        font-size: 14px;
        color: #666;
        line-height: 1.4;
    }

    .registration-form .checkbox-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: #667eea;
        margin-top: 2px;
    }

    .registration-form .terms-link,
    .registration-form .privacy-link {
        color: #667eea;
        text-decoration: none;
    }

    .registration-form .terms-link:hover,
    .registration-form .privacy-link:hover {
        text-decoration: underline;
    }

    .registration-form .form-actions {
        display: flex;
        gap: 15px;
        justify-content: flex-end;
        margin-top: 20px;
    }

    .registration-form .btn-primary,
    .registration-form .btn-secondary {
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .registration-form .btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }

    .registration-form .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }

    .registration-form .btn-secondary {
        background: #f8f9fa;
        color: #666;
        border: 1px solid #ddd;
    }

    .registration-form .btn-secondary:hover {
        background: #e9ecef;
        border-color: #adb5bd;
    }

    @keyframes modalSlideIn {
        from {
            opacity: 0;
            transform: scale(0.9) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }
`;
document.head.appendChild(style);

// Export for use in other files
window.auth = auth;


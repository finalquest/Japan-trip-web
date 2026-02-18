// Authentication utilities
const API_BASE = '';
let authToken = localStorage.getItem('authToken') || null;
let currentUser = null;

// Check if user is authenticated
function isAuthenticated() {
    return !!authToken;
}

// Get auth headers
function getAuthHeaders() {
    return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

// Login
async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }
        
        const data = await response.json();
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        
        hideLoginModal();
        showUserInfo();
        initApp();
        
        return true;
    } catch (err) {
        console.error('Login error:', err);
        showLoginError(err.message);
        return false;
    }
}

// Check current user
async function checkAuth() {
    if (!authToken) {
        showLoginModal();
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error('Invalid token');
        }
        
        currentUser = await response.json();
        hideLoginModal();
        showUserInfo();
        initApp();
        return true;
    } catch (err) {
        console.error('Auth check failed:', err);
        authToken = null;
        localStorage.removeItem('authToken');
        showLoginModal();
        return false;
    }
}

// Show login modal
function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
    document.querySelector('main').style.display = 'none';
    document.querySelector('.navbar').style.display = 'none';
}

// Hide login modal
function hideLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
    document.querySelector('main').style.display = 'block';
    document.querySelector('.navbar').style.display = 'flex';
}

// Show login error
function showLoginError(message) {
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Show user info in navbar
function showUserInfo() {
    if (currentUser) {
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('current-user').textContent = `👤 ${currentUser.username}`;
        document.getElementById('users-btn').style.display = 'inline-block';
    }
}

// Users Management
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/api/users`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load users');
        
        const users = await response.json();
        displayUsers(users);
    } catch (err) {
        console.error('Error loading users:', err);
        alert('Error cargando usuarios');
    }
}

function displayUsers(users) {
    const container = document.getElementById('users-list');
    container.innerHTML = users.map(user => `
        <div class="user-item">
            <span class="username">${user.username} ${user.isAdmin ? '(Admin)' : ''}</span>
            ${!user.isAdmin ? `<button onclick="deleteUser('${user.id}')" class="btn-delete">🗑️</button>` : ''}
        </div>
    `).join('');
}

async function createUser(username, password) {
    try {
        const response = await fetch(`${API_BASE}/api/users`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create user');
        }
        
        await loadUsers();
        return true;
    } catch (err) {
        console.error('Error creating user:', err);
        alert(err.message);
        return false;
    }
}

async function deleteUser(userId) {
    if (!confirm('¿Eliminar este usuario?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/users/${userId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to delete user');
        
        await loadUsers();
    } catch (err) {
        console.error('Error deleting user:', err);
        alert('Error eliminando usuario');
    }
}

// Modal functions
function showUsersModal() {
    document.getElementById('users-modal').style.display = 'flex';
    loadUsers();
}

function closeUsersModal() {
    document.getElementById('users-modal').style.display = 'none';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Login form
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        await login(username, password);
    });
    
    // Add user form
    document.getElementById('add-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        
        if (await createUser(username, password)) {
            document.getElementById('new-username').value = '';
            document.getElementById('new-password').value = '';
        }
    });
    
    // Check auth on load
    checkAuth();
});

// Export for use in app.js
window.isAuthenticated = isAuthenticated;
window.getAuthHeaders = getAuthHeaders;
window.currentUser = () => currentUser;
window.showUsersModal = showUsersModal;
window.closeUsersModal = closeUsersModal;
window.deleteUser = deleteUser;

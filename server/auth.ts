import { promises as fs } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';

export interface User {
  id: string;
  email: string;
  password: string;
  createdAt: string;
}

export interface AuthResult {
  success: boolean;
  user?: Omit<User, 'password'>;
  error?: string;
}

const USERS_FILE = join(process.cwd(), 'data', 'users.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = join(process.cwd(), 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Load users from file
async function loadUsers(): Promise<User[]> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save users to file
async function saveUsers(users: User[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

// Register new user
export async function registerUser(email: string, password: string): Promise<AuthResult> {
  try {
    const users = await loadUsers();
    
    // Check if user already exists
    if (users.find(u => u.email === email)) {
      return { success: false, error: 'User already exists' };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser: User = {
      id: Date.now().toString(),
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await saveUsers(users);

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Registration failed' };
  }
}

// Login user
export async function loginUser(email: string, password: string): Promise<AuthResult> {
  try {
    const users = await loadUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return { success: false, error: 'Invalid credentials' };
    }

    const { password: _, ...userWithoutPassword } = user;
    return { success: true, user: userWithoutPassword };
  } catch (error) {
    return { success: false, error: 'Login failed' };
  }
}

// Get user by ID
export async function getUserById(id: string): Promise<Omit<User, 'password'> | null> {
  try {
    const users = await loadUsers();
    const user = users.find(u => u.id === id);
    if (!user) return null;

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    return null;
  }
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate password strength
export function isValidPassword(password: string): boolean {
  return password.length >= 6;
}
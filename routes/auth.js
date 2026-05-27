const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Options for cookies
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

// User Registration
router.post('/register', async (req, res) => {
  try {
    const { name, email, photoURL, password, authProvider } = req.body;
    const db = getDB();
    const usersCollection = db.collection('users');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    
    if (existingUser) {
      // If registering via Google and user exists, just log them in
      if (authProvider === 'google') {
        const token = jwt.sign({ id: existingUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, cookieOptions);
        return res.status(200).json({ message: 'Logged in successfully via Google', user: { id: existingUser._id, name: existingUser.name, email: existingUser.email, photoURL: existingUser.photoURL } });
      }
      return res.status(400).json({ message: 'User already exists' });
    }

    let hashedPassword = '';
    if (password) {
      // Password validation: min 6 chars, 1 uppercase, 1 lowercase (also done on frontend, but good to have here)
      const passRegex = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;
      if (!passRegex.test(password)) {
        return res.status(400).json({ message: 'Password must be at least 6 characters with uppercase and lowercase letters' });
      }
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const newUser = {
      name,
      email,
      photoURL,
      password: hashedPassword,
      authProvider: authProvider || 'local',
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    
    if (authProvider === 'google') {
      const token = jwt.sign({ id: result.insertedId }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, cookieOptions);
      return res.status(201).json({ message: 'Registered and logged in via Google', user: { id: result.insertedId, name, email, photoURL } });
    }

    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// User Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, authProvider, name, photoURL } = req.body;
    const db = getDB();
    const usersCollection = db.collection('users');

    let user = await usersCollection.findOne({ email });

    if (authProvider === 'google') {
      if (!user) {
         // Create user if not exists for google login
         const newUser = {
          name,
          email,
          photoURL,
          authProvider: 'google',
          createdAt: new Date(),
        };
        const result = await usersCollection.insertOne(newUser);
        user = { _id: result.insertedId, ...newUser };
      }
    } else {
      if (!user) {
        return res.status(400).json({ message: 'Invalid email or password' });
      }
      if (user.authProvider !== 'google') {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(400).json({ message: 'Invalid email or password' });
        }
      }
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, cookieOptions);

    res.status(200).json({
      message: 'Login successful',
      user: { id: user._id, name: user.name, email: user.email, photoURL: user.photoURL }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// User Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

// Get Current User (for auth context on reload)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { ObjectId } = require('mongodb');
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email, photoURL: user.photoURL }
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;

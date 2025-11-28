const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Registro - GET
router.get('/register', (req, res) => {
  res.render('register', { error: null });  // ← AÑADE ESTO
});

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validación básica
    if (!email || !password) {
      return res.render('register', { error: 'Email y contraseña son obligatorios' });
    }

    const user = new User({ email, password });
    await user.save();
    
    // Mensaje bonito cuando todo sale bien
    res.render('login', { 
      error: null, 
      success: `¡Cuenta creada con éxito! Ya puedes iniciar sesión con ${email}` 
    });

  } catch (err) {
    console.log("ERROR COMPLETO:", err); // ← ESTO ES CLAVE PARA VER EL ERROR REAL

    let mensaje = 'Error al crear la cuenta';

    if (err.code === 11000) {
      mensaje = 'Este correo ya está registrado';
    } else if (err.name === 'ValidationError') {
      mensaje = Object.values(err.errors)[0].message;
    } else {
      mensaje = err.message || 'Error desconocido';
    }

    res.render('register', { error: mensaje });
  }
});
// Login - GET (ya lo tenías bien, pero por si acaso)
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) throw new Error('Usuario o contraseña incorrectos');

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new Error('Usuario o contraseña incorrectos');

    req.session.user = { id: user._id, email: user.email };
    res.redirect('/dashboard');
  } catch (err) {
    res.render('login', { error: err.message });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
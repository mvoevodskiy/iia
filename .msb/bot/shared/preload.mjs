import profile from './profile.cjs';

// Import this before application modules that capture env at module initialization.
profile.initialize(process.env);

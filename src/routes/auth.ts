import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, logger } from '../index';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

// Register
router.post('/register', async (req: AuthRequest, res: Response, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      throw new AppError(400, 'Email, password, and name are required');
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError(409, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '10'));

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', {
      expiresIn: process.env.JWT_EXPIRY || '7d',
    });

    logger.info(`User registered: ${email}`);
    res.status(201).json({ user: { id: user.id, email, name }, token });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req: AuthRequest, res: Response, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid credentials');
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', {
      expiresIn: process.env.JWT_EXPIRY || '7d',
    });

    logger.info(`User logged in: ${email}`);
    res.json({ user: { id: user.id, email, name: user.name }, token });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    next(error);
  }
});

export default router;

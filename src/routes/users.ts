import { Router, Response } from 'express';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

// Get all users (protected)
router.get('/', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true },
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

// Get user by ID (protected)
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// Update user (protected, self only)
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.userId !== req.params.id) {
      throw new AppError(403, 'Forbidden');
    }

    const { name, email } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(email && { email }) },
      select: { id: true, email: true, name: true },
    });

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// Delete user (protected, self only)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.userId !== req.params.id) {
      throw new AppError(403, 'Forbidden');
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;

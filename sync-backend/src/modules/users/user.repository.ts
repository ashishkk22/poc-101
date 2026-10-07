import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';

export const userRepository = {
  async findById(id: string, db: DbClient = prisma) {
    return db.user.findUnique({ where: { id }, select: { id: true, email: true, name: true } });
  },

  async findByEmail(email: string, db: DbClient = prisma) {
    return db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });
  },

  /**
   * Directory lookup used when building an invitation list.
   *
   * Requires an exact email or a bounded prefix and always caps the result
   * set, so the endpoint cannot be turned into a user-enumeration oracle.
   */
  async search(query: { email?: string; limit: number }, db: DbClient = prisma) {
    if (!query.email) return [];
    return db.user.findMany({
      where: { email: query.email.toLowerCase() },
      select: { id: true, email: true, name: true },
      take: query.limit,
    });
  },
};

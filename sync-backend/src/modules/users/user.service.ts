import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { userRepository } from './user.repository.js';

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

export const userService = {
  async me(userId: string): Promise<UserDto> {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED);
    return user;
  },

  /** Exact-match only; see the repository note on enumeration. */
  async lookupByEmail(email: string): Promise<UserDto | null> {
    return userRepository.findByEmail(email);
  },
};

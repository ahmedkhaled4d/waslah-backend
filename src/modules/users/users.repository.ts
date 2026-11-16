import { UserModel, type User } from './users.model';

export const usersRepository = {
  list(): Promise<User[]> {
    return UserModel.find().sort({ name: 1 }).lean<User[]>();
  },

  findById(id: string): Promise<User | null> {
    return UserModel.findById(id).lean<User>();
  },

  findByEmail(email: string): Promise<User | null> {
    return UserModel.findOne({ email }).lean<User>();
  },

  async create(data: Omit<User, '_id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const doc = await UserModel.create(data);
    return doc.toObject();
  },

  update(id: string, data: Partial<Omit<User, '_id'>>): Promise<User | null> {
    return UserModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: 'after' }).lean<User>();
  },

  async touchLastLogin(id: User['_id'], at: Date): Promise<void> {
    await UserModel.updateOne({ _id: id }, { $set: { lastLoginAt: at } });
  },
};

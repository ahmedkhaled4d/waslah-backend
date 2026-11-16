import { isDuplicateKeyError } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { labelsRepository } from './labels.repository';
import type { Label } from './labels.model';
import type { CreateLabelInput, UpdateLabelInput } from './labels.schemas';

const nameKey = (name: string) => name.trim().toLowerCase();

function duplicateName(): ConflictError {
  return new ConflictError('LABEL_EXISTS', 'A label with this name already exists');
}

export const labelsService = {
  list(): Promise<Label[]> {
    return labelsRepository.list();
  },

  async assertExists(id: string): Promise<void> {
    if (!(await labelsRepository.findById(id))) throw new NotFoundError('Label');
  },

  async create(input: CreateLabelInput): Promise<Label> {
    try {
      return await labelsRepository.create({ ...input, nameKey: nameKey(input.name) });
    } catch (err) {
      if (isDuplicateKeyError(err)) throw duplicateName();
      throw err;
    }
  },

  async update(id: string, input: UpdateLabelInput): Promise<Label> {
    try {
      const label = await labelsRepository.update(id, {
        ...input,
        ...(input.name ? { nameKey: nameKey(input.name) } : {}),
      });
      if (!label) throw new NotFoundError('Label');
      return label;
    } catch (err) {
      if (isDuplicateKeyError(err)) throw duplicateName();
      throw err;
    }
  },

  /** Deletes only the label document. Use labelDeletionService to also detach it everywhere. */
  async deleteLabelDocument(id: string): Promise<void> {
    if (!(await labelsRepository.delete(id))) throw new NotFoundError('Label');
  },
};

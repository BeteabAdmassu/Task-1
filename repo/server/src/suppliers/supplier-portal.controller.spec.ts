import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SupplierPortalController } from './supplier-portal.controller';
import { SuppliersService } from './suppliers.service';
import { User } from '../users/user.entity';
import { Supplier } from './supplier.entity';
import { Role } from '../common/enums/role.enum';

const mockSupplier = (id = 'sup-1'): Supplier =>
  ({
    id,
    name: 'Acme Corp',
    contactName: 'Alice',
    email: 'alice@acme.com',
    phone: '555-1234',
    address: '123 Main St',
    paymentTerms: 'NET_30',
    customTermsDescription: null,
    bankingNotes: 'SENSITIVE — should not appear in portal response',
    internalRiskFlag: 'HIGH — should not appear in portal response',
    isActive: true,
    fingerprint: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Supplier;

const mockUserWithSupplier = (supplierId: string | null): User =>
  ({
    id: 'user-1',
    username: 'supplier_user',
    role: Role.SUPPLIER,
    supplierId,
    supplier: supplierId ? mockSupplier(supplierId) : null,
    isActive: true,
    mustChangePassword: false,
  }) as unknown as User;

describe('SupplierPortalController', () => {
  let controller: SupplierPortalController;

  const usersRepository = { findOne: jest.fn() };
  const suppliersService = { findById: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupplierPortalController],
      providers: [
        { provide: SuppliersService, useValue: suppliersService },
        { provide: getRepositoryToken(User), useValue: usersRepository },
      ],
    }).compile();

    controller = module.get<SupplierPortalController>(SupplierPortalController);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns safe supplier fields (no banking or risk data)', async () => {
      const supplier = mockSupplier('sup-1');
      usersRepository.findOne.mockResolvedValue(mockUserWithSupplier('sup-1'));
      suppliersService.findById.mockResolvedValue(supplier);

      const req = { user: { id: 'user-1' } } as any;
      const result = await controller.getProfile(req);

      // Safe fields present
      expect(result.id).toBe('sup-1');
      expect(result.name).toBe('Acme Corp');
      expect(result.email).toBe('alice@acme.com');

      // Sensitive fields must NOT be exposed
      expect((result as Record<string, unknown>).bankingNotes).toBeUndefined();
      expect((result as Record<string, unknown>).internalRiskFlag).toBeUndefined();
    });

    it('returns only the authenticated supplier\'s own data (object-level isolation)', async () => {
      // User linked to supplier sup-1 cannot retrieve sup-2 data
      usersRepository.findOne.mockResolvedValue(mockUserWithSupplier('sup-1'));
      suppliersService.findById.mockResolvedValue(mockSupplier('sup-1'));

      const req = { user: { id: 'user-1' } } as any;
      const result = await controller.getProfile(req);

      // Should only query for their own supplierId, not an arbitrary one
      expect(suppliersService.findById).toHaveBeenCalledWith('sup-1');
      expect(result.id).toBe('sup-1');
    });

    it('throws 404 when user has no linked supplier', async () => {
      usersRepository.findOne.mockResolvedValue(mockUserWithSupplier(null));

      const req = { user: { id: 'user-1' } } as any;
      await expect(controller.getProfile(req)).rejects.toThrow(NotFoundException);
    });

    it('throws 404 when user record does not exist', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      const req = { user: { id: 'ghost-user' } } as any;
      await expect(controller.getProfile(req)).rejects.toThrow(NotFoundException);
    });
  });
});

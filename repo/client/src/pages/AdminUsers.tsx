import { useState, useEffect, useCallback } from 'react';
import {
  fetchUsers,
  createUser,
  updateUser,
  resetUserPassword,
  UserRecord,
  PaginatedUsers,
} from '../api/admin';
import { getRoleDisplayName } from '../utils/roles';
import { CreateUserModal } from '../components/admin/CreateUserModal';
import { EditUserModal } from '../components/admin/EditUserModal';

const ROLES = [
  'PROCUREMENT_MANAGER',
  'WAREHOUSE_CLERK',
  'PLANT_CARE_SPECIALIST',
  'ADMINISTRATOR',
  'SUPPLIER',
];

export function AdminUsers() {
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: '20',
        sortBy,
        sortOrder,
      };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (activeFilter) params.isActive = activeFilter;

      const result = await fetchUsers(params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, activeFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  const handleCreate = async (payload: { username: string; password: string; role: string; isActive: boolean }) => {
    await createUser(payload);
    setShowCreate(false);
    loadUsers();
  };

  const handleUpdate = async (id: string, payload: { role?: string; isActive?: boolean }) => {
    await updateUser(id, payload);
    setEditingUser(null);
    loadUsers();
  };

  const handleResetPassword = async (id: string) => {
    const result = await resetUserPassword(id);
    setTempPassword(result.temporaryPassword);
  };

  const sortIndicator = (field: string) => {
    if (sortBy !== field) return '';
    return sortOrder === 'ASC' ? ' ^' : ' v';
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>User Management</h1>
        <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          Create User
        </button>
      </div>

      {/* Filters */}
      <div className="filters-row">
        <input
          type="text"
          placeholder="Search username..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="filter-input"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="filter-select"
        >
          <option value="">All Roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {getRoleDisplayName(r)}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setPage(1);
          }}
          className="filter-select"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Temp password alert */}
      {tempPassword && (
        <div className="info-banner">
          Temporary password: <strong>{tempPassword}</strong>
          <button className="btn-text" onClick={() => setTempPassword(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('username')} className="sortable">
                Username{sortIndicator('username')}
              </th>
              <th onClick={() => handleSort('role')} className="sortable">
                Role{sortIndicator('role')}
              </th>
              <th onClick={() => handleSort('isActive')} className="sortable">
                Status{sortIndicator('isActive')}
              </th>
              <th onClick={() => handleSort('createdAt')} className="sortable">
                Created{sortIndicator('createdAt')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="table-empty">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty">
                  No users found.
                </td>
              </tr>
            )}
            {!loading &&
              data?.data.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{getRoleDisplayName(user.role)}</td>
                  <td>
                    <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button className="btn-text" onClick={() => setEditingUser(user)}>
                      Edit
                    </button>
                    <button className="btn-text" onClick={() => handleResetPassword(user.id)}>
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.meta.totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-text"
          >
            Previous
          </button>
          <span>
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <button
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-text"
          >
            Next
          </button>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}

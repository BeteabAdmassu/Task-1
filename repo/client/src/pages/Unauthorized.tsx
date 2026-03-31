import { useNavigate } from 'react-router-dom';

export function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <h1>Access Denied</h1>
      <p>You do not have permission to view this page.</p>
      <button className="btn-primary" onClick={() => navigate(-1)}>
        Go Back
      </button>
    </div>
  );
}

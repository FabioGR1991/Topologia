import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Ruta relativa a la carpeta public de React
const LOGO_URL = '/logo-tandem.png';

// 1. Nodo Individual para Líderes / Cargos Unipersonales
const UserNode = ({ data }) => {
  return (
    <div className="bg-white border-2 border-slate-300 rounded-xl p-3 shadow-md hover:shadow-xl transition cursor-pointer min-w-[180px] text-center relative group overflow-hidden">
      {/* --- Logo Tandem de Fondo (Centrado, desenfocado y opaco) --- */}
      <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center p-2">
        <img
          src={LOGO_URL}
          alt="Watermark Logo"
          className="w-full h-full object-contain object-center opacity-15 blur-[1px] scale-90"
        />
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-blue-500 border-2 border-white cursor-crosshair z-20"
      />

      {/* --- Contenido encima del Fondo --- */}
      <div className="relative z-10">
        <img
          src={data.photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
          alt={data.name}
          className="w-14 h-14 rounded-full mx-auto mb-2 object-cover border-2 border-slate-200 pointer-events-none shadow-sm"
        />
        <div className="font-bold text-sm text-slate-800 pointer-events-none">{data.name}</div>
        <div className="text-xs text-slate-500 font-medium pointer-events-none">{data.role}</div>
        <span className="inline-block mt-2 text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold pointer-events-none">
          {data.department}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-blue-500 border-2 border-white cursor-crosshair z-20"
      />
    </div>
  );
};

// 2. Nodo de Área / Departamento (Contenedor con Avatares)
const DepartmentNode = ({ data }) => {
  const { departmentName, description, members, onSelectMember } = data;

  return (
    <div className="bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 shadow-2xl min-w-[320px] max-w-[480px] text-center relative overflow-hidden">
      {/* --- Logo Tandem de Fondo (Centrado, desenfocado y opaco) --- */}
      <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center p-4">
        <img
          src={LOGO_URL}
          alt="Watermark Logo"
          className="w-full h-full object-contain object-center opacity-10 blur-[1.5px] scale-95"
        />
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="w-3.5 h-3.5 !bg-blue-400 border-2 border-slate-800 cursor-crosshair z-20"
      />

      {/* --- Contenido encima del Fondo --- */}
      <div className="relative z-10">
        {/* Encabezado del Área */}
        <div className="mb-3 border-b border-slate-700 pb-2">
          <h3 className="font-bold text-base text-white tracking-wide">{departmentName}</h3>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </div>

        {/* Grid de Miembros del Sector */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          {members.map((member) => (
            <div
              key={member.id}
              onClick={(e) => {
                e.stopPropagation(); // Evita interferir con el arrastre del nodo
                onSelectMember(member);
              }}
              className="flex flex-col items-center p-2 rounded-xl hover:bg-slate-700/60 transition cursor-pointer group/avatar"
            >
              <div className="relative">
                <img
                  src={member.photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                  alt={member.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-blue-400/80 group-hover/avatar:border-blue-400 group-hover/avatar:scale-105 transition shadow-sm"
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-200 mt-1.5 max-w-[90px] truncate group-hover/avatar:text-blue-300">
                {member.name}
              </span>
              <span className="text-[9px] text-slate-400 max-w-[90px] truncate">
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3.5 h-3.5 !bg-blue-400 border-2 border-slate-800 cursor-crosshair z-20"
      />
    </div>
  );
};

const nodeTypes = {
  userNode: UserNode,
  departmentNode: DepartmentNode
};

export default function App() {
  const [selectedUser, setSelectedUser] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [rawUsers, setRawUsers] = useState([]);

  const [copiedEmail, setCopiedEmail] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);

  const [formData, setFormData] = useState({
    name: '', role: '', department: '', photoUrl: '', functions: '', permissions: '', reportsToId: '', email: ''
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/users');
      const data = await res.json();
      setRawUsers(data);

      // 1. Agrupar por departamento
      const deptGroups = data.reduce((acc, user) => {
        const dept = user.department || 'Sin Departamento';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(user);
        return acc;
      }, {});

      const flowNodes = [];
      const userIdToNodeIdMap = {};

      Object.keys(deptGroups).forEach((deptName, index) => {
        const members = deptGroups[deptName];

        if (members.length >= 2) {
          const deptNodeId = `dept-${deptName}`;

          members.forEach(m => {
            userIdToNodeIdMap[m.id] = deptNodeId;
          });

          const allFunctions = [...new Set(members.flatMap(m => m.functions || []))];
          const autoDescription = allFunctions.length > 0
            ? allFunctions.slice(0, 3).join(' / ')
            : 'Sector de ' + deptName;

          flowNodes.push({
            id: deptNodeId,
            type: 'departmentNode',
            position: {
              x: members[0].positionX || (index % 3) * 360 + 100,
              y: members[0].positionY || Math.floor(index / 3) * 260 + 100
            },
            data: {
              departmentName: deptName,
              description: autoDescription,
              members,
              onSelectMember: (user) => setSelectedUser(user)
            }
          });
        } else {
          members.forEach((u) => {
            userIdToNodeIdMap[u.id] = String(u.id);
            flowNodes.push({
              id: String(u.id),
              type: 'userNode',
              position: { x: u.positionX || 100, y: u.positionY || 100 },
              data: u
            });
          });
        }
      });

      // 2. Mapear conexiones
      const flowEdges = [];
      const createdEdgeKeys = new Set();

      data.forEach(u => {
        if (u.reportsToId) {
          const sourceNodeId = userIdToNodeIdMap[u.reportsToId];
          const targetNodeId = userIdToNodeIdMap[u.id];

          if (sourceNodeId && targetNodeId && sourceNodeId !== targetNodeId) {
            const edgeKey = `e-${sourceNodeId}-${targetNodeId}`;

            if (!createdEdgeKeys.has(edgeKey)) {
              createdEdgeKeys.add(edgeKey);
              flowEdges.push({
                id: edgeKey,
                source: sourceNodeId,
                target: targetNodeId,
                animated: true,
                style: { stroke: '#2563eb', strokeWidth: 2, cursor: 'pointer' },
                interactionWidth: 20
              });
            }
          }
        }
      });

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (error) {
      console.error("Error al cargar datos:", error);
    }
  };

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onEdgeClick = async (_, edge) => {
    if (confirm("¿Deseas desvincular esta relación jerárquica?")) {
      const childId = edge.target;
      const childUser = rawUsers.find(u => String(u.id) === childId);

      if (childUser) {
        await fetch(`http://localhost:3001/api/users/${childId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...childUser, reportsToId: null })
        });
        fetchUsers();
      }
    }
  };

  const onNodeDragStop = async (_, node) => {
    try {
      const userIdsToUpdate = node.type === 'departmentNode'
        ? node.data.members.map(m => m.id)
        : [node.id];

      const payloadNodes = userIdsToUpdate.map(id => ({
        id, x: node.position.x, y: node.position.y
      }));

      await fetch('http://localhost:3001/api/users/positions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: payloadNodes })
      });
    } catch (err) {
      console.error("Error guardando posición:", err);
    }
  };

  const onConnect = useCallback(async (params) => {
    const { source, target } = params;

    let parentUserId = null;
    let targetUserIds = [];

    if (source.startsWith('dept-')) {
      const deptName = source.replace('dept-', '');
      const firstMember = rawUsers.find(u => u.department === deptName);
      if (firstMember) parentUserId = firstMember.id;
    } else {
      parentUserId = Number(source);
    }

    if (target.startsWith('dept-')) {
      const deptName = target.replace('dept-', '');
      targetUserIds = rawUsers.filter(u => u.department === deptName).map(u => u.id);
    } else {
      targetUserIds = [Number(target)];
    }

    if (parentUserId && targetUserIds.length > 0) {
      await Promise.all(
        targetUserIds.map(childId => {
          const childUser = rawUsers.find(u => u.id === childId);
          if (!childUser) return Promise.resolve();
          return fetch(`http://localhost:3001/api/users/${childId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...childUser, reportsToId: parentUserId })
          });
        })
      );
      fetchUsers();
    }
  }, [rawUsers]);

  const handleOpenCreateModal = () => {
    setEditingUserId(null);
    setFormData({ name: '', role: '', department: '', photoUrl: '', functions: '', permissions: '', reportsToId: '', email: '' });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user) => {
    setEditingUserId(user.id);
    setFormData({
      name: user.name,
      role: user.role,
      department: user.department,
      photoUrl: user.photoUrl || '',
      email: user.email || '',
      functions: Array.isArray(user.functions) ? user.functions.join(', ') : '',
      permissions: Array.isArray(user.permissions) ? user.permissions.join(', ') : '',
      reportsToId: user.reportsToId ? String(user.reportsToId) : ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rawFunctions = typeof formData.functions === 'string' ? formData.functions : '';
    const rawPermissions = typeof formData.permissions === 'string' ? formData.permissions : '';

    const payload = {
      ...formData,
      functions: rawFunctions ? rawFunctions.split(',').map(f => f.trim()).filter(Boolean) : [],
      permissions: rawPermissions ? rawPermissions.split(',').map(p => p.trim()).filter(Boolean) : [],
      reportsToId: formData.reportsToId ? Number(formData.reportsToId) : null
    };

    const url = editingUserId
      ? `http://localhost:3001/api/users/${editingUserId}`
      : 'http://localhost:3001/api/users';

    try {
      const res = await fetch(url, {
        method: editingUserId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        setSelectedUser(null);
        fetchUsers();
      }
    } catch (error) {
      console.error("Error guardando usuario:", error);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm("¿Seguro que deseas eliminar este usuario?")) return;
    try {
      const res = await fetch(`http://localhost:3001/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedUser(null);
        fetchUsers();
      }
    } catch (error) {
      console.error("Error eliminando usuario:", error);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans relative">

      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={handleOpenCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 cursor-pointer transition"
        >
          <span>➕</span> Agregar Personal
        </button>
      </div>

      <div className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgeClick={onEdgeClick}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onNodeClick={(_, node) => {
            if (node.type === 'userNode') setSelectedUser(node.data);
          }}
          translateExtent={[[-1500, -1500], [3000, 3000]]}
          nodeExtent={[[-1500, -1500], [3000, 3000]]}
          fitView
        >
          <Background color="#94a3b8" gap={24} size={1.5} />
          <Controls />
        </ReactFlow>
      </div>

      {/* Ficha Lateral de Información del Personal con Efecto Glass y Transición Suave */}
      <div
        style={{
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
        className={`w-96 bg-white/70 border-l border-white/40 p-6 shadow-2xl overflow-y-auto flex flex-col justify-between z-20 absolute top-0 right-0 h-full transition-all duration-300 ease-in-out ${
          selectedUser
            ? 'opacity-100 translate-x-0 pointer-events-auto'
            : 'opacity-0 translate-x-12 pointer-events-none'
        }`}
      >
        {selectedUser && (
          <>
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ficha del Personal</span>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-slate-500 hover:text-slate-800 font-bold text-lg bg-white/60 hover:bg-white w-8 h-8 rounded-full flex items-center justify-center cursor-pointer shadow-sm transition"
                >
                  ✕
                </button>
              </div>

              <img
                src={selectedUser.photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                alt={selectedUser.name}
                className="w-44 h-44 rounded-full mx-auto mb-4 object-cover border-4 border-white/80 shadow-lg"
              />

              <h2 className="text-xl font-bold text-center text-slate-800">{selectedUser.name}</h2>
              <p className="text-center text-sm text-blue-600 font-semibold mb-4">{selectedUser.role}</p>

              {/* --- BOTÓN DE COPIADO DE EMAIL --- */}
              <div className="mb-6 flex justify-center">
                <button
                  onClick={() => {
                    const emailToCopy = selectedUser.email || `${selectedUser.name.toLowerCase().replace(/\s+/g, '.')}@empresa.com`;
                    navigator.clipboard.writeText(emailToCopy);
                    setCopiedEmail(true);
                    setTimeout(() => setCopiedEmail(false), 2000);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/60 border border-white/80 rounded-lg text-xs font-medium text-slate-700 hover:bg-white transition-all cursor-pointer shadow-sm"
                >
                  <span>{selectedUser.email || `${selectedUser.name.toLowerCase().replace(/\s+/g, '.')}@empresa.com`}</span>

                  {copiedEmail ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1 animate-in fade-in">
                      Copiado!
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Departamento</h3>
                  <p className="text-slate-800 text-sm font-medium">{selectedUser.department}</p>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Funciones</h3>
                  <ul className="space-y-1">
                    {selectedUser.functions?.map((func, i) => (
                      <li key={i} className="text-sm text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                        {func}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Permisos</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedUser.permissions?.map((perm, i) => (
                      <span key={i} className="text-xs bg-white/70 border border-slate-200/80 text-slate-700 px-2.5 py-1 rounded-md font-medium shadow-sm">
                        🔒 {perm}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 mt-6">
              <button
                onClick={() => handleOpenEditModal(selectedUser)}
                className="w-full bg-blue-600/90 hover:bg-blue-600 text-white font-semibold py-2 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                ✏️ Editar Información
              </button>
              <button
                onClick={() => handleDeleteUser(selectedUser.id)}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold py-2 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-2"
              >
                🗑️ Eliminar Usuario
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="text-lg font-bold text-slate-800">
                {editingUserId ? '✏️ Editar Personal' : '➕ Agregar Nuevo Personal'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 font-bold cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Completo *</label>
                <input
                  type="text" required value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
                <input
                  type="email" value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="usuario@empresa.com"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Puesto / Cargo *</label>
                <input
                  type="text" required value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Departamento *</label>
                <input
                  type="text" required value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">URL de Foto de Perfil</label>
                <input
                  type="text" value={formData.photoUrl}
                  onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">¿A quién reporta? (Superior)</label>
                <select
                  value={formData.reportsToId}
                  onChange={(e) => setFormData({ ...formData, reportsToId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-blue-500 bg-white"
                >
                  <option value="">Ninguno (Es cabeza de área/CEO)</option>
                  {rawUsers.filter(u => u.id !== editingUserId).map(u => (
                    <option key={u.id} value={u.id}>{u.name} - ({u.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Funciones (comas)</label>
                <input
                  type="text" value={formData.functions}
                  onChange={(e) => setFormData({ ...formData, functions: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Permisos (comas)</label>
                <input
                  type="text" value={formData.permissions}
                  onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 font-semibold py-2 rounded-lg text-sm cursor-pointer">Cancelar</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg text-sm shadow-md cursor-pointer">{editingUserId ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
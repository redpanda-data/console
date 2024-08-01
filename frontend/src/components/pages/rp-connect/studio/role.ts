export type RoleInfo = {
  id: string,
  name: string
  level: number
  description: string
}

export const RoleIDs = {
  Pending: 'pending',
  Reader: 'reader',
  Collaborator: 'collaborator',
  Administrator: 'administrator',
  Owner: 'owner',
};

const rolesList = [
  {
    id: RoleIDs.Pending,
    name: 'Pending',
    level: 0,
    description: 'A user that has no rights within an organisation, this is the default role for a new user whilst they await a proper role assignment.',
  },
  {
    id: RoleIDs.Reader,
    name: 'Read only',
    level: 1,
    description: 'A user that can read organisation sessions but cannot edit nor create sessions themselves.',
  },
  {
    id: RoleIDs.Collaborator,
    name: 'Collaborator',
    level: 2,
    description: 'A user that can read and write organisation sessions, create new sessions, but cannot invite or change the roles of other users.',
  },
  {
    id: RoleIDs.Administrator,
    name: 'Admin',
    level: 3,
    description: 'A user that can perform all the actions of a collaborator and can also invite and change the roles of other users.',
  },
  {
    id: RoleIDs.Owner,
    name: 'Owner',
    level: 4,
    description: 'A user that can perform all the actions of an administrator and can also remove other administrators and delete the organisation.',
  },
];

const rolesMap: {
  [key: string]: RoleInfo | undefined;
} = {};
rolesList.forEach((value: RoleInfo) => {
  rolesMap[value.id] = value;
});

export function RoleIsReadOnly(id: string): boolean {
  return id === 'reader';
}

export function RoleIsOwner(id: string): boolean {
  return (rolesMap[id]?.level || 0) >= 4;
}

export function RoleIsAdmin(id: string): boolean {
  return (rolesMap[id]?.level || 0) >= 3;
}

export function RoleIsCollab(id: string): boolean {
  return (rolesMap[id]?.level || 0) >= 2;
}

export function ListRoles(): RoleInfo[] {
  return rolesList;
}

export function RoleFromID(id: string): RoleInfo | undefined {
  return rolesMap[id];
}

export default function GetName(name: string): string {
  const v = rolesMap[name];
  if ( v !== undefined ) {
    return v.name;
  }
  return 'Unknown';
}

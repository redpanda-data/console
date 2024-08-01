import React from 'react';

type Limits = {
  sessions: number;
  session_files: number;
  organisations: number;
  collaborators: number;
};

export type UserInfo = {
  id: string;
  name: string;
  local: boolean;
  avatar_url: string;
  product_name: string;
  limits: Limits;
};

export type SystemInfo = {
  shost: boolean;
	shost_admin_pass_warn: boolean; // Whether the admin password needs changing
	shost_expires: number; // How many seconds before the license expires
};

type Environment = {
  serverURL: string;
  developmentMode: boolean;
  system: {
    isLoading: boolean;
    info: SystemInfo | null;
    refresh: () => void;
  },
  user: {
    isLoading: boolean;
    info: UserInfo | null;
    refresh: () => void;
  };
};

const EnvContext = React.createContext<Environment>({
  serverURL: '',
  developmentMode: false,
  system: {
    isLoading: true,
    info: null,
    refresh: () => {},
  },
  user: {
    isLoading: true,
    info: null,
    refresh: () => {},
  },
});

export default EnvContext;

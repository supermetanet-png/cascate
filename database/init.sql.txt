
-- System Schema for Cascata Control Plane
CREATE SCHEMA IF NOT EXISTS system;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Projects Table
CREATE TABLE system.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'healthy',
    database_url TEXT NOT NULL,
    jwt_secret TEXT NOT NULL,
    service_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Platform Admin Users
CREATE TABLE system.admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Admin
-- password: 'admin' (Change in production!)
INSERT INTO system.admin_users (email, password_hash) 
VALUES ('admin@cascata.io', '$2b$12$K7TfK5Wf5vVf5vVf5vVf5u5u5u5u5u5u5u5u5u5u5u5u5u5u5u5u');

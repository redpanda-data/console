# Shadow Link Certificate Architecture

## Table of Contents
1. [What are Shadow Links?](#what-are-shadow-links)
2. [TLS vs mTLS](#tls-vs-mtls)
3. [Certificate Types](#certificate-types)
4. [Backend Proto Schema](#backend-proto-schema)
5. [Frontend Schema](#frontend-schema)
6. [Certificate Input Modes](#certificate-input-modes)
7. [Validation Rules](#validation-rules)
8. [User Journey](#user-journey)
9. [Technical Implementation](#technical-implementation)

---

## What are Shadow Links?

Shadow links are Redpanda's **disaster recovery** feature that enables active-passive cluster replication for business continuity.

### Purpose
- **Disaster Recovery**: Mirror data from a primary cluster to a shadow cluster in a separate region
- **Regional Failover**: Enable rapid recovery in case of regional cloud failures
- **Data Resilience**: Create a fully functional hot-standby clone of your entire cluster

### What Gets Replicated
- ✅ Topics and topic data
- ✅ Topic configurations
- ✅ Consumer group offsets (critical for resuming exactly where you left off)
- ✅ ACLs (Access Control Lists)
- ✅ Schemas (Schema Registry entries)

### Key Metrics
- **RPO (Recovery Point Objective)**: A few seconds
- **RTO (Recovery Time Objective)**: Near-instant (limited only by producer/consumer timeout settings)

### Why This Matters for Certificates
To establish a shadow link, the shadow cluster must connect to the **source cluster** as a client. This requires:
1. **Network connectivity** to source cluster bootstrap servers
2. **TLS encryption** (optional but recommended for production)
3. **mTLS authentication** (optional, for mutual certificate-based auth)
4. **SCRAM credentials** (optional alternative authentication method)

---

## TLS vs mTLS

### TLS (Server-side TLS Only)
**Purpose**: Encrypt the connection between shadow cluster and source cluster

```
Shadow Cluster ──[encrypted]──> Source Cluster
                                     ↓
                                Verifies own
                                 identity
```

**When to use**:
- Production environments that require encrypted connections
- When you want to verify the source cluster's identity

**Certificates needed**:
- **CA Certificate** (optional): Verifies the source cluster's certificate

---

### mTLS (Mutual TLS)
**Purpose**: Both sides authenticate each other using certificates

```
Shadow Cluster ──[encrypted + authenticated]──> Source Cluster
      ↓                                               ↓
  Proves its                                   Verifies shadow
  identity with                                cluster identity
  client cert                                  AND proves own
                                               identity
```

**When to use**:
- High-security environments
- When the source cluster requires client certificate authentication
- When both sides need to verify each other's identity

**Certificates needed**:
- **CA Certificate**: Verifies the source cluster's certificate
- **Client Certificate**: Proves the shadow cluster's identity to the source
- **Client Private Key**: Signs authentication requests from shadow cluster

---

## Certificate Types

### 1. CA Certificate (Certificate Authority)
**Purpose**: Verifies that the source cluster's TLS certificate is legitimate

**Analogy**: Like checking a website's SSL certificate in your browser - you trust the CA that signed it

**Technical Details**:
- Used to validate the certificate chain presented by the source cluster
- Prevents man-in-the-middle attacks
- Typically a `.crt` or `.pem` file

**Required for**:
- TLS (optional but recommended)
- mTLS (required)

**Example path**: `/etc/redpanda/certs/ca.crt`

---

### 2. Client Certificate
**Purpose**: Proves the shadow cluster's identity to the source cluster

**Analogy**: Like showing your passport at the airport - proves who you are

**Technical Details**:
- Contains the shadow cluster's public key
- Signed by a CA that the source cluster trusts
- Presented during TLS handshake
- Typically a `.crt` or `.pem` file

**Required for**:
- mTLS only (not needed for TLS-only connections)
- Must be paired with a client private key

**Example path**: `/etc/redpanda/certs/client.crt`

---

### 3. Client Private Key
**Purpose**: Signs authentication messages to prove the shadow cluster owns the client certificate

**Analogy**: Like the signature that goes with your passport - proves the passport is yours

**Technical Details**:
- **Must be kept secret** - never share or expose
- Cryptographically linked to the client certificate
- Used to sign data during TLS handshake
- Typically a `.key` or `.pem` file

**Required for**:
- mTLS only (not needed for TLS-only connections)
- Must be paired with a client certificate

**Security Note**: This is sensitive data. The PEM mode embeds this in the configuration.

**Example path**: `/etc/redpanda/certs/client.key`

---

## Backend Proto Schema

The backend expects certificates in one of two formats, defined in the protobuf schema:

### Proto Definition

```protobuf
message TLSSettings {
  bool enabled = 3;

  oneof tls_settings {
    TLSFileSettings tls_file_settings = 1;
    TLSPEMSettings tls_pem_settings = 2;
  }

  bool do_not_set_sni_hostname = 4;
}

message TLSFileSettings {
  string ca_path = 1;       // Path to CA certificate on broker
  string key_path = 2;      // Path to client private key on broker
  string cert_path = 3;     // Path to client certificate on broker
}

message TLSPEMSettings {
  string ca = 1;           // CA certificate PEM content
  string key = 2;          // Client private key PEM content (REQUIRED_FIELD)
  string key_fingerprint = 3;  // Key fingerprint (OUTPUT_ONLY)
  string cert = 4;         // Client certificate PEM content
}
```

**Key Points**:
1. **Oneof union**: Backend accepts EITHER file paths OR PEM content, not both
2. **Optional certificates**: All three certificates are optional
3. **mTLS detection**: Backend infers mTLS if client cert + key are present
4. **Key sensitivity**: The `key` field in PEMSettings is marked as `REQUIRED_FIELD` in protovalidate

### Certificate Optionality Rules

| Configuration | CA | Client Cert | Client Key | Result |
|--------------|----|-----------|-----------| -------|
| None provided | ❌ | ❌ | ❌ | TLS disabled |
| CA only | ✅ | ❌ | ❌ | TLS with server verification |
| CA + Cert + Key | ✅ | ✅ | ✅ | mTLS (full mutual auth) |
| Cert without Key | ✅ | ✅ | ❌ | ❌ **Invalid** |
| Key without Cert | ✅ | ❌ | ✅ | ❌ **Invalid** |

**Validation Rule**: If either client cert or client key is provided, BOTH must be provided.

---

## Frontend Schema

### Form Values Structure

```typescript
type FormValues = {
  // TLS enabled/disabled toggle
  useTls: boolean;

  // Certificate input mode
  mtlsMode: 'file_path' | 'pem';

  // Certificate data
  mtls: {
    ca?: {
      filePath?: string;      // For file_path mode
      pemContent?: string;    // For pem mode
      fileName?: string;      // UI only - display name for uploaded file
    };
    clientCert?: {
      filePath?: string;
      pemContent?: string;
      fileName?: string;
    };
    clientKey?: {
      filePath?: string;
      pemContent?: string;
      fileName?: string;
    };
  };

  // Other connection settings...
  bootstrapServers: Array<{ value: string }>;
  useScram: boolean;
  scramCredentials?: {
    username: string;
    password: string;
    mechanism: ScramMechanism;
  };
};
```

### Zod Validation Schema

```typescript
const FormSchema = z.object({
  useTls: z.boolean(),

  mtlsMode: z.enum(['file_path', 'pem']),

  mtls: z.object({
    ca: z.object({
      filePath: z.string().optional(),
      pemContent: z.string().optional(),
      fileName: z.string().optional(),
    }).optional(),

    clientCert: z.object({
      filePath: z.string().optional(),
      pemContent: z.string().optional(),
      fileName: z.string().optional(),
    }).optional(),

    clientKey: z.object({
      filePath: z.string().optional(),
      pemContent: z.string().optional(),
      fileName: z.string().optional(),
    }).optional(),
  }),

  // ... other fields
}).superRefine((data, ctx) => {
  // Validation: Client cert and key must be provided together
  const hasClientKey = data.mtlsMode === 'file_path'
    ? Boolean(data.mtls.clientKey?.filePath?.trim())
    : Boolean(data.mtls.clientKey?.pemContent?.trim());

  const hasClientCert = data.mtlsMode === 'file_path'
    ? Boolean(data.mtls.clientCert?.filePath?.trim())
    : Boolean(data.mtls.clientCert?.pemContent?.trim());

  if (hasClientKey && !hasClientCert) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Client certificate is required when client private key is provided',
      path: ['mtls', 'clientCert'],
    });
  }

  if (hasClientCert && !hasClientKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Client private key is required when client certificate is provided',
      path: ['mtls', 'clientKey'],
    });
  }
});
```

---

## Certificate Input Modes

The UI offers two ways to provide certificates:

### Mode 1: Upload (PEM Content)
**UI**: File dropzone or file picker

**What happens**:
1. User drags/drops or selects a certificate file
2. File is read as text content
3. PEM content is stored in `pemContent` field
4. File name stored in `fileName` for display only

**Backend behavior**:
- Certificate content is **embedded** in the shadow link configuration
- Broker stores the PEM content directly
- No external file dependencies

**Use case**:
- ✅ Certificates generated outside the broker environment
- ✅ Cloud/managed environments where file system access is limited
- ✅ Easier setup for users (no need to SSH to broker)

**Trade-offs**:
- ✅ Self-contained configuration
- ✅ No file path management
- ⚠️ Sensitive data (private key) stored in configuration
- ⚠️ Configuration size increases

---

### Mode 2: File Path (Broker-side Files)
**UI**: Text input for absolute file path

**What happens**:
1. User enters absolute path to certificate on broker (e.g., `/etc/redpanda/certs/ca.crt`)
2. Path is stored in `filePath` field

**Backend behavior**:
- Broker reads certificates from the specified file paths
- Files must already exist on the broker's file system
- Path is relative to broker's file system context

**Use case**:
- ✅ Certificates already deployed to broker via configuration management
- ✅ Centralized certificate management
- ✅ Private key never leaves the broker

**Trade-offs**:
- ✅ More secure (private key not in config)
- ✅ Smaller configuration size
- ⚠️ Requires file system access to broker
- ⚠️ Files must be deployed separately

---

## Validation Rules

### Frontend Validation (Zod)

1. **Bootstrap servers**: At least one required, must be in `host:port` format
2. **mTLS pairing**: If client cert provided, client key is required (and vice versa)
3. **SCRAM credentials**: If SCRAM enabled, username and password required

### Backend Validation (Protovalidate)

From the proto schema:
1. **File paths**: Must be valid absolute paths if provided
2. **PEM content**: Must be valid PEM-encoded certificate/key
3. **Client key security**: Marked as `REQUIRED_FIELD` (sensitive)
4. **Bootstrap servers**: At least one required

### Validation Flow

```
User fills form
     ↓
Zod validates on form submission
     ↓
Form values transformed to proto message
     ↓
Sent to backend API
     ↓
Backend validates proto message
     ↓
Backend attempts to use certificates
     ↓
Connection test or error returned
```

---

## User Journey

### High-Level Flow

```
Start Create Shadow Link
         ↓
┌────────────────────┐
│ Step 1: Connection │  ← Certificates configured here
└────────────────────┘
         ↓
    Fill form:
    - Shadow link name
    - Bootstrap servers
    - Enable TLS? ──→ Yes ──→ Configure certificates
         ↓                         ↓
         No                   Certificate mode?
         ↓                    ├─ Upload (PEM)
         ↓                    └─ File path
         ↓                         ↓
         ↓                    Add certificates:
         ↓                    - CA cert (optional)
         ↓                    - Client cert (for mTLS)
         ↓                    - Client key (for mTLS)
         ↓                         ↓
         └─────────────────────────┘
         ↓
    SCRAM auth? (alternative to mTLS)
         ↓
    Click "Next"
         ↓
┌────────────────────────┐
│ Step 2: Configuration  │
└────────────────────────┘
         ↓
    Configure:
    - Topics to replicate
    - Consumer offset sync
    - ACL sync
         ↓
    Click "Create shadow link"
         ↓
    Backend validates & creates
         ↓
    Success ──→ Navigate to shadow link list
         ↓
    Error ──→ Show error message
```

### Detailed Certificate Configuration Flow

**Entry Point**: `bootstrap-servers.tsx` component
**Location**: Step 1 (Connection) of shadow link creation wizard

#### 1. Enable TLS Toggle
```
User sees: Enable TLS [Enabled] [Disabled]
Default: Enabled
```

**If disabled**: Certificate section hidden, proceeds with unencrypted connection

**If enabled**: Shows mTLS certificate configuration section

#### 2. Certificate Input Mode
```
User sees: Certificate input method [Upload] [File path]
Default: Upload
```

**Mode switch**: Clears all certificate data to prevent mixing modes

#### 3. Certificate Upload Mode (PEM)

For each certificate type (CA, Client Cert, Client Key):

```
┌──────────────────────────────┐
│ Add [Certificate Type]       │
│ [+ Button]                   │
└──────────────────────────────┘
```

**Click button** → Opens dialog with file dropzone

```
┌────────────────────────────────────┐
│ CA certificate                     │
│ Certificate Authority certificate  │
│ to verify server identity          │
│                                    │
│ ┌────────────────────────────────┐ │
│ │  Drop file here or click       │ │
│ │  to upload                     │ │
│ │  (.pem, .crt, .cer, .key)      │ │
│ └────────────────────────────────┘ │
│                                    │
│ [Cancel]  [Add certificate]        │
└────────────────────────────────────┘
```

**After upload**: Button changes to show certificate status

```
┌──────────────────────────────┐
│ CA certificate               │
│ ca.crt                       │  ← File name displayed
│ [Edit] [Delete]              │
└──────────────────────────────┘
```

#### 4. Certificate File Path Mode

For each certificate type:

```
┌──────────────────────────────┐
│ CA certificate path          │
│ [/etc/redpanda/certs/ca.crt] │  ← Text input
└──────────────────────────────┘
```

**Placeholder paths**:
- CA: `/etc/redpanda/certs/ca.crt`
- Client cert: `/etc/redpanda/certs/client.crt`
- Client key: `/etc/redpanda/certs/client.key`

#### 5. Validation & Error Display

**Error states**:
- Missing client cert when client key is provided
- Missing client key when client cert is provided
- Invalid file path format
- Invalid bootstrap server format

**Error display location**: Below the certificate section

```
⚠ Client certificate is required when client private key is provided
```

#### 6. Navigation

**Next button**:
- Validates Step 1 fields (name, bootstrap servers, certificates, SCRAM)
- If valid: Proceeds to Step 2 (Configuration)
- If invalid: Shows validation errors, stays on Step 1

---

## Technical Implementation

### Key Files

| File | Purpose |
|------|---------|
| `src/components/pages/shadowlinks/create/connection/bootstrap-servers.tsx` | Main connection step component |
| `src/components/pages/shadowlinks/create/connection/tls-configuration.tsx` | TLS enable/disable toggle |
| `src/components/pages/shadowlinks/create/connection/mtls-configuration.tsx` | Certificate upload/path UI |
| `src/components/pages/shadowlinks/create/connection/certificate-dialog.tsx` | Modal for adding/editing certificates |
| `src/components/pages/shadowlinks/create/model.ts` | Form schema and validation |
| `src/components/pages/shadowlinks/create/shadowlink-create-page.tsx` | Main create page with stepper |
| `src/components/pages/shadowlinks/edit/shadowlink-edit-utils.ts` | Certificate transformation utilities |

### Certificate Transformation Logic

#### Frontend → Backend

Location: `shadowlink-create-page.tsx` → `buildCreateShadowLinkRequest()`

```typescript
// Build TLS settings from form values
const buildTLSSettings = (values: FormValues) => {
  const hasCertificates =
    values.mtlsMode === 'file_path'
      ? Boolean(values.mtls.ca?.filePath ||
                values.mtls.clientCert?.filePath ||
                values.mtls.clientKey?.filePath)
      : Boolean(values.mtls.ca?.pemContent ||
                values.mtls.clientCert?.pemContent ||
                values.mtls.clientKey?.pemContent);

  if (!hasCertificates) {
    return undefined; // No mTLS
  }

  if (values.mtlsMode === 'file_path') {
    return {
      case: 'tlsFileSettings',
      value: create(TLSFileSettingsSchema, {
        caPath: values.mtls.ca?.filePath,
        keyPath: values.mtls.clientKey?.filePath,
        certPath: values.mtls.clientCert?.filePath,
      }),
    };
  }

  // PEM mode
  return {
    case: 'tlsPemSettings',
    value: create(TLSPEMSettingsSchema, {
      ca: values.mtls.ca?.pemContent,
      key: values.mtls.clientKey?.pemContent,
      cert: values.mtls.clientCert?.pemContent,
    }),
  };
};

// Include in client options
const clientOptions = create(ShadowLinkClientOptionsSchema, {
  bootstrapServers: values.bootstrapServers.map(s => s.value),
  tlsSettings: values.useTls
    ? create(TLSSettingsSchema, {
        enabled: true,
        tlsSettings: buildTLSSettings(values),
      })
    : undefined,
  // ... other options
});
```

#### Backend → Frontend

Location: `shadowlink-edit-utils.ts` → `extractTLSSettings()`

```typescript
const extractTLSSettings = (
  tlsCertsSettings: TLSSettings['tlsSettings'] | undefined
): Pick<FormValues, 'mtlsMode' | 'mtls'> => {
  if (!tlsCertsSettings) {
    return {
      mtlsMode: 'pem',
      mtls: {
        ca: undefined,
        clientCert: undefined,
        clientKey: undefined,
      },
    };
  }

  if (tlsCertsSettings.case === 'tlsFileSettings') {
    const fileSettings = tlsCertsSettings.value;
    return {
      mtlsMode: 'file_path',
      mtls: {
        ca: fileSettings.caPath
          ? { filePath: fileSettings.caPath }
          : undefined,
        clientCert: fileSettings.certPath
          ? { filePath: fileSettings.certPath }
          : undefined,
        clientKey: fileSettings.keyPath
          ? { filePath: fileSettings.keyPath }
          : undefined,
      },
    };
  }

  // tlsPemSettings case
  if (tlsCertsSettings.case === 'tlsPemSettings') {
    const pemSettings = tlsCertsSettings.value;
    return {
      mtlsMode: 'pem',
      mtls: {
        ca: pemSettings.ca
          ? { pemContent: pemSettings.ca }
          : undefined,
        clientCert: pemSettings.cert
          ? { pemContent: pemSettings.cert }
          : undefined,
        clientKey: pemSettings.key
          ? { pemContent: pemSettings.key }
          : undefined,
      },
    };
  }

  // Fallback
  return {
    mtlsMode: 'pem',
    mtls: {
      ca: undefined,
      clientCert: undefined,
      clientKey: undefined,
    },
  };
};
```

### Component Hierarchy

```
ShadowLinkCreatePage
  └─ Stepper (2 steps)
      └─ ConnectionStep (Step 1)
          └─ BootstrapServers
              ├─ Bootstrap server inputs (dynamic array)
              ├─ TlsConfiguration
              │   └─ Toggle: Enabled/Disabled
              └─ MtlsConfiguration (shown if TLS enabled)
                  ├─ Mode tabs: Upload/File path
                  ├─ Certificate inputs (3 types)
                  └─ CertificateDialog (modal)
                      ├─ File dropzone (upload mode)
                      └─ Path input (file path mode)
```

---

## Security Considerations

### 1. Private Key Handling

**Upload mode (PEM)**:
- ⚠️ Private key is embedded in shadow link configuration
- ⚠️ Stored in backend database
- ⚠️ Transmitted over network (HTTPS)
- ✅ User has full control and visibility
- ✅ No external file dependencies

**File path mode**:
- ✅ Private key never leaves broker file system
- ✅ Only path stored in configuration
- ✅ File permissions control access
- ⚠️ Requires separate deployment process

### 2. Certificate Rotation

**Upload mode**:
- Edit shadow link → Upload new certificate → Update

**File path mode**:
- Replace file on broker → Restart shadow link (or wait for refresh)
- More complex but cleaner separation of concerns

### 3. Access Control

**Question to consider for UX redesign**:
- Who has permission to view certificates in upload mode?
- Should private key content be viewable in edit mode?
- Should we show certificate metadata (expiry, issuer) to help with rotation?

---

## Common User Scenarios

### Scenario 1: Testing in Development
**Setup**: Local Redpanda cluster with self-signed certificates

**Certificate needs**:
- Generate self-signed CA cert
- Generate client cert signed by CA
- Generate client private key

**Recommended mode**: Upload (easier for dev)

**Why certificates**: Even in dev, good to test TLS/mTLS flow

---

### Scenario 2: Production with Enterprise CA
**Setup**: Production clusters with enterprise certificate authority

**Certificate needs**:
- CA cert from enterprise PKI
- Client cert issued by enterprise CA
- Client private key

**Recommended mode**: File path (better security)

**Why certificates**: Production encryption + mTLS for security compliance

---

### Scenario 3: Cloud-to-Cloud Replication
**Setup**: Redpanda Cloud in two regions

**Certificate needs**:
- Cloud provider CA
- Auto-generated client certificates

**Recommended mode**: Depends on cloud provider's certificate management

**Why certificates**: TLS required for cross-region traffic

---

### Scenario 4: Simple TLS (No mTLS)
**Setup**: Encrypted connection, but SCRAM auth instead of mTLS

**Certificate needs**:
- CA cert (optional, for server verification)
- No client cert/key needed

**Recommended mode**: Either (just CA cert)

**Why certificates**: Encryption in transit, auth via username/password

---

## UX Redesign Considerations

Based on this analysis, here are key questions for your UX redesign:

### 1. Mode Selection
- Should mode (upload vs file path) be explicit tabs or inferred from first input?
- Can we combine both modes (e.g., CA via upload, client cert via file path)?

### 2. Certificate Grouping
- Should we group by "TLS only" vs "mTLS" instead of listing 3 certificates?
- Show a visual flow: No TLS → TLS → mTLS?

### 3. Guidance & Education
- Where to explain TLS vs mTLS to users?
- Should we show examples of certificate contents?
- Inline help text vs external docs?

### 4. Validation Feedback
- Show validation as user types or only on submit?
- How to clearly explain "cert requires key" constraint?

### 5. Certificate Status
- Show certificate metadata (expiry, issuer, subject)?
- Visual indicators for certificate health?

### 6. Security UX
- How to indicate which mode is more secure?
- Warnings when embedding private keys?
- Option to not display private key content in edit mode?

### 7. Progressive Disclosure
- Start simple (no TLS) and progressively add complexity?
- Wizard within wizard for certificate setup?

### 8. Error States
- Connection test before proceeding to Step 2?
- Show specific TLS/certificate errors from backend?

---

## References

**Code Locations**:
- Form schema: `src/components/pages/shadowlinks/create/model.ts`
- Proto definitions: `src/protogen/redpanda/core/admin/v2/shadow_link_pb.ts`
- Certificate UI: `src/components/pages/shadowlinks/create/connection/`
- Transform utils: `src/components/pages/shadowlinks/edit/shadowlink-edit-utils.ts`

**External Resources**:
- Redpanda Shadowing feature: https://www.redpanda.com/blog/25-3-enterprise-disaster-recovery
- TLS/mTLS concepts: Standard X.509 certificate authentication

---

## Appendix: Example Certificates

### CA Certificate (Example Structure)
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKJ... (base64 encoded)
-----END CERTIFICATE-----
```

### Client Certificate (Example Structure)
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJALM... (base64 encoded)
-----END CERTIFICATE-----
```

### Client Private Key (Example Structure)
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w... (base64 encoded)
-----END PRIVATE KEY-----
```

**Note**: These are PEM-encoded formats. The UI accepts these as-is in upload mode.

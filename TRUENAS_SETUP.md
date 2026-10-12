# TrueNAS SCALE Setup & Deployment Guide for Somnia

This guide provides complete instructions to build, publish, and deploy **Somnia (OpenRouter Batch Manager)** on **TrueNAS SCALE** via the **Custom App** Web UI or **Docker Compose**.

---

## 1. Preliminary Prerequisites

Before deploying Somnia on TrueNAS SCALE, verify the following prerequisites:

1. **TrueNAS SCALE Apps Service**:
   - Navigate to **Apps** in your TrueNAS SCALE dashboard.
   - If not already configured, click **Settings** > **Choose Pool** and select your primary storage pool (e.g., `tank` or `pool1`) to initialize the container engine (Docker/k3s depending on SCALE release).
2. **OpenRouter Account & API Key**:
   - Create an account or sign in at [openrouter.ai](https://openrouter.ai).
   - Generate an API Key under [openrouter.ai/keys](https://openrouter.ai/keys) with sufficient credits for batch inference.
3. **Docker on your Build Machine (or TrueNAS Shell)**:
   - Ensure Docker Engine is installed and running if building the container image from source.

---

## 2. Building & Publishing the Docker Image

You can build Somnia locally on your development machine and push it to a container registry (Docker Hub or GitHub Container Registry), or build it directly on TrueNAS via SSH.

### Method A: Push to Docker Hub (Recommended)
From the root of the Somnia repository:

```bash
# 1. Log in to Docker Hub
docker login

# 2. Build the production multi-stage image
docker build -t yourdockerhubuser/somnia:latest .

# 3. Push to Docker Hub
docker push yourdockerhubuser/somnia:latest
```

### Method B: Push to GitHub Container Registry (GHCR)
```bash
# 1. Authenticate with GitHub Container Registry
export CR_PAT=YOUR_GITHUB_PERSONAL_ACCESS_TOKEN
echo $CR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# 2. Build and tag the image
docker build -t ghcr.io/yourgithubuser/somnia:latest .

# 3. Push to GHCR
docker push ghcr.io/yourgithubuser/somnia:latest
```

> **Cross-Platform / Multi-Arch Note**:
> If you are building on an **Apple Silicon (ARM64)** Mac but deploying to an **x86_64 / amd64** TrueNAS SCALE server, use `docker buildx` to ensure binary compatibility:
> ```bash
> docker buildx build --platform linux/amd64 -t yourdockerhubuser/somnia:latest --push .
> ```

### Method C: Build Directly on TrueNAS SCALE (via Shell/SSH)
If you prefer not to use an external registry:
1. Open TrueNAS **System Settings** > **Shell** (or SSH into your server).
2. Clone or transfer the project files:
   ```bash
   git clone <your-repo-url> /tmp/somnia
   cd /tmp/somnia
   docker build -t somnia:latest .
   ```

---

## 3. Storage Dataset Preparation (TrueNAS Host)

Somnia persists its SQLite database (`somnia.db`), batch results, and log exports in `/app/data`. You must create a dedicated dataset on TrueNAS to ensure data persists across container updates.

1. In TrueNAS SCALE, go to **Datasets**.
2. Select your pool (e.g. `tank`) and click **Add Dataset**.
3. Configure:
   - **Name**: `somnia` (Full host path: `/mnt/tank/somnia`)
   - **Dataset Preset**: `Generic` / `POSIX`
4. Click **Save**.
5. Select the newly created `somnia` dataset, click **Edit Permissions**:
   - Set **User**: `1000` (or `apps`)
   - Set **Group**: `1000` (or `apps`)
   - Grant **Read / Write / Execute** for Owner and Group.
   - Click **Save Access Control List**.

> Somnia's container uses `PUID=1000` and `PGID=1000` by default. Setting ownership of `/mnt/tank/somnia` to `1000:1000` ensures the container has full read/write access without causing TrueNAS permission lockouts.

---

## 4. Option 1: Deploy via TrueNAS SCALE "Custom App" (Web UI)

1. In TrueNAS SCALE, navigate to **Apps** > **Discover Apps**.
2. Click **Install Custom App** (top right).
3. Fill in the deployment form:

### Application Details
* **Application Name**: `somnia`

### Container Image
* **Image repository**: `yourdockerhubuser/somnia` (or `somnia` if built locally)
* **Image tag**: `latest`
* **Image Pull Policy**: `IfNotPresent` (or `Always` if using an external registry)

### Container Environment Variables
Click **Add** under **Environment Variables**:

| Variable Name | Value | Description |
| :--- | :--- | :--- |
| `PUID` | `1000` | Process user ID matching dataset ownership |
| `PGID` | `1000` | Process group ID matching dataset ownership |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` *(Optional)* | Pre-sets your API key (can also be entered in Web UI) |
| `POLL_INTERVAL_MINUTES` | `5` | Background polling frequency (defaults to 5) |

### Networking (Port Forwarding)
Click **Add** under **Port Forwarding**:
* **Container Port**: `8000`
* **Node Port (Host Port)**: `9000` (or any available port between `9000`-`9099`)
* **Protocol**: `TCP`

### Storage (Host Path Volumes)
Click **Add** under **Host Path Volumes**:
* **Host Path**: `/mnt/tank/somnia`
* **Container Path**: `/app/data`
* **Read Only**: `Unchecked` (Write access is required for SQLite)

### Review and Launch
4. Click **Install**.
5. TrueNAS will pull the image, mount the dataset, and start the application.

---

## 5. Option 2: Deploy via Docker Compose (or Dockge / Portainer)

If you use Docker Compose directly on TrueNAS or run a manager like Dockge or Portainer:

```yaml
services:
  somnia:
    image: yourdockerhubuser/somnia:latest
    container_name: somnia
    restart: unless-stopped
    ports:
      - "9000:8000"
    environment:
      - OPENROUTER_API_KEY=sk-or-v1-your-key-here
      - PUID=1000
      - PGID=1000
      - POLL_INTERVAL_MINUTES=5
    volumes:
      - /mnt/tank/somnia:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

Launch the service:
```bash
docker compose up -d
```

---

## 6. Accessing & Using Somnia

1. Open your browser and navigate to:
   ```
   http://<YOUR-TRUENAS-IP>:9000
   ```
2. **Configure Credentials**:
   - If you did not supply `OPENROUTER_API_KEY` in environment variables, click **Settings & Auth** at the bottom of the sidebar.
   - Enter your OpenRouter key and click **Save Key to Database**. The key will be securely saved into SQLite and masked in the UI.
3. **Launch a Batch**:
   - Click **+ New Batch**.
   - Drag and drop any `.csv` file.
   - Click auto-generated variable chips (e.g. `{{product_name}}`) to construct your prompt template.
   - Choose your model, adjust the temperature slider, and select reasoning effort (if using `o1`, `o3`, or `DeepSeek-R1`).
   - Click **Submit Batch**.
4. **Monitor Progress**:
   - Active batches display in the **Active** sidebar section with a rotating spinner.
   - Every 5 minutes, the built-in background poller queries OpenRouter.
   - When finished, results are downloaded into SQLite, the batch moves to **Archive**, and a **pulsing teal dot** appears to alert you of completed results.
   - Selecting the batch opens the table view and automatically marks the batch as read.
   - Click **Export CSV** or **JSON** to download enriched outputs.

---

## 7. Backup & Maintenance

Because all state is strictly confined to `/app/data`:
* **SQLite Database**: `/mnt/tank/somnia/somnia.db`
* **JSON Results Archive**: `/mnt/tank/somnia/results/`
* You can snapshot or replicate `/mnt/tank/somnia` using standard TrueNAS ZFS snapshots for instant, zero-downtime backups.

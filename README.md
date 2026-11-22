
# 🌱 ResiliFarm AI
### Smart Water Management for Agricultural Resilience

**Making every drop count. Building more resilient agriculture.**

ResiliFarm AI is an intelligent agricultural decision-support platform designed to help farmers and agronomists manage water resources more efficiently, optimize irrigation strategies, reduce energy consumption, and anticipate agricultural risks.

The solution combines agricultural intelligence, weather data, water-resource management, energy analysis, risk simulation, and AI-assisted tools in one connected ecosystem.

ResiliFarm provides two complementary interfaces:
- **Web Platform:** An advanced workspace for administrators and agronomists.
- **Mobile Application:** A simple and accessible experience for farmers, developed with React Native.

Both applications communicate with a shared backend and database.

---

## 📑 Table of Contents

- [The Problem](#-the-problem)
- [Our Solution](#-our-solution)
- [Key Features](#-key-features)
- [Applications](#-applications)
- [User Roles](#-user-roles)
- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Agricultural Intelligence](#-agricultural-intelligence)
- [AI and Intelligent Capabilities](#-ai-and-intelligent-capabilities)
- [IoT and Hardware Design](#-iot-and-hardware-design)
- [Installation and Setup](#-installation-and-setup)
- [Project Structure](#-project-structure)
- [Limitations and Assumptions](#-limitations-and-assumptions)
- [Future Improvements](#-future-improvements)

---

## 🌍 The Problem

Agriculture is increasingly affected by water scarcity, climate change, unpredictable weather conditions, and rising energy costs.

Farmers face several challenges:

- Determining how much water their crops actually need.
- Choosing the right irrigation timing.
- Managing limited water resources during drought periods.
- Avoiding unnecessary water consumption.
- Reducing the energy required for water pumping.
- Anticipating agricultural disruptions such as heatwaves, droughts, leaks, and pump failures.
- Accessing useful agricultural information through simple and understandable tools.

The challenge is not only having enough water. It is knowing how to manage the water available.

## 💡 Our Solution

ResiliFarm AI provides a centralized platform that transforms agricultural, environmental, and infrastructure information into actionable insights.

The platform helps users:

1. Estimate crop-specific irrigation requirements.
2. Compare agricultural water demand with available resources.
3. Explore water allocation strategies.
4. Estimate pumping energy requirements and potential solar contribution.
5. Simulate agricultural and infrastructure disruptions.
6. Evaluate possible interventions before implementing them.
7. Access information through interfaces adapted to each user.

Our objective is to support more informed agricultural decisions and strengthen resilience to water scarcity.

---

## 🚀 Key Features

### 1. Agricultural Intelligence

- Crop-specific water requirement estimation.
- Irrigation demand calculations based on agricultural parameters.
- Weather-informed irrigation planning.
- Crop and growth-stage information.
- Agricultural stress indicators.

### 2. Smart Water Management

- Water demand and availability comparison.
- Water allocation analysis.
- Irrigation resource planning.
- Water shortage scenarios.
- Water management recommendations.

### 3. Energy Optimization

- Water pumping energy estimation.
- Pumping requirements analysis.
- Solar energy contribution estimation.
- Energy consumption scenarios.
- Potential energy-saving strategies.

### 4. Infrastructure and Risk Analysis

- Simplified water network analysis.
- Pipe pressure estimation.
- Leak and infrastructure disruption scenarios.
- Pump failure simulations.
- Agricultural risk assessment.

### 5. AIoT Design Lab

An AI-assisted environment that allows users to explore conceptual irrigation hardware configurations.

Capabilities include:

- Creating irrigation hardware concepts from a component catalogue.
- Adding and replacing hardware components.
- Exploring component connections and wiring.
- Generating bills of materials.
- Producing conceptual hardware diagrams.
- Generating starter firmware.
- Exporting design documentation.

### 6. Digital Twin and Scenario Simulation

The platform provides an environment to explore agricultural and infrastructure scenarios.

Examples include:

- Drought conditions.
- High-temperature periods.
- Water supply restrictions.
- Irrigation leaks.
- Pump failures.
- Changes in water availability.

Users can compare scenarios and explore possible management strategies.

---

## 📱 Applications

ResiliFarm AI consists of two connected applications designed for different users.

### Web Platform

**Built with React and TypeScript.**

The web application provides advanced agricultural analysis and platform management capabilities.

Main functionalities:

- Agricultural intelligence dashboard.
- Farm and agricultural data analysis.
- Water allocation and infrastructure management.
- Energy analysis.
- Risk and scenario simulations.
- AIoT Design Lab.
- User and farm management.
- Administrative operations.

The web platform is primarily intended for agronomists and administrators.

### Farmer Mobile Application

**Built with React Native and Expo.**

The mobile application provides a simplified interface designed around the everyday needs of farmers.

Main functionalities:

- View farm information.
- Consult irrigation recommendations.
- Check irrigation schedules.
- View weather information.
- Receive agricultural alerts and notifications.
- Consult water availability information when data is available.
- Record irrigation activities.
- Report problems affecting the farm.
- Contact an assigned agronomist.

The mobile experience prioritizes simplicity, accessibility, and understandable recommendations.

Farmers should not need to understand technical concepts such as ET0, crop coefficients, communication protocols, or hardware configurations to use the application.

---

## 👥 User Roles

ResiliFarm AI supports three main user roles.

### Farmer

The farmer uses the mobile application to:

- Access assigned farm information.
- Consult irrigation recommendations.
- Follow irrigation schedules.
- Receive alerts.
- Report agricultural or infrastructure problems.
- Communicate with an assigned agronomist.

### Agronomist

The agronomist uses the web platform to:

- Access assigned farms.
- Analyze agricultural conditions.
- Review crop water requirements.
- Evaluate irrigation strategies.
- Analyze water and energy consumption.
- Explore risk scenarios.
- Create and manage conceptual AIoT designs.

### Administrator

The administrator manages the platform:

- Create and manage farmer accounts.
- Create and manage agronomist accounts.
- Register and manage farms.
- Assign farmers to farms.
- Assign agronomists to farms.
- Manage IoT device registrations.
- Activate and deactivate accounts.
- Monitor platform activity.

Role-based permissions are intended to ensure that each user accesses only the information and operations appropriate to their responsibilities.

---

## 🏗️ System Architecture

The platform follows a shared-backend architecture.

```text
                 RESILIFARM AI
                       |
          +------------+------------+
          |                         |
     WEB PLATFORM              MOBILE APP
    React + TypeScript       React Native + Expo
          |                         |
          +------------+------------+
                       |
                  REST API
                  FastAPI
                       |
          +------------+------------+
          |                         |
       SERVICES                 AI SERVICES
          |                         |
  Agricultural Engine        Optional Qwen3
  Water Management           via Ollama
  Energy Estimation
  Risk Simulation
  Authentication
          |
       DATABASE
     PostgreSQL
       / SQLite
          |
    External Services
          |
      Open-Meteo
```

Both applications communicate with the same backend, allowing agricultural information and user data to be managed centrally.

---

## 🛠️ Technology Stack

| Component | Technologies |
|---|---|
| Web Frontend | React, TypeScript, Vite |
| Mobile Application | React Native, Expo, TypeScript |
| Backend | Python, FastAPI |
| Database | PostgreSQL, SQLite |
| ORM | SQLAlchemy |
| Data Validation | Pydantic |
| Maps | Leaflet |
| Charts | Recharts |
| Internationalization | i18next |
| Weather Data | Open-Meteo API |
| AI Integration | Qwen3 4B Instruct, Ollama |
| Containerization | Docker, Docker Compose |
| Programming Languages | TypeScript, Python |

---

## 🌾 Agricultural Intelligence

ResiliFarm uses agricultural water-balance concepts to estimate crop irrigation requirements.

### Crop Water Requirement

The platform uses the FAO-style relationship:

```text
ETc = Kc × ET0
```

Where:

- `ETc`: Crop evapotranspiration.
- `Kc`: Crop coefficient.
- `ET0`: Reference evapotranspiration.

The calculation estimates crop water requirements based on reference evapotranspiration and crop characteristics.

### Effective Rainfall

Rainfall information can be considered when estimating the amount of irrigation water required.

### Irrigation Requirements

The platform considers agricultural parameters such as:

- Crop type.
- Growth stage.
- Field area.
- Soil characteristics.
- Irrigation method.
- Weather conditions.
- Available water resources.

The objective is to provide a more informed estimation of irrigation requirements.

---

## 🤖 AI and Intelligent Capabilities

ResiliFarm combines agricultural calculations, intelligent assistance, and scenario-based analysis.

### AI-Assisted Studio

The AIoT Design Lab can optionally use a locally hosted Qwen3 model through Ollama to interpret natural-language hardware design requests.

Example requests:

- "Create a solar irrigation controller."
- "Add another soil moisture sensor."
- "Replace Wi-Fi with LoRa."

The AI-assisted workflow helps translate user requests into catalogue-based hardware concepts.

### Intelligent Decision Support

The platform brings together agricultural parameters, weather information, and water availability to support irrigation planning.

### Future Predictive Capabilities

Potential future machine-learning extensions include:

- Soil moisture forecasting.
- Irrigation demand prediction.
- Crop water-stress risk prediction.
- Water network anomaly detection.
- Leak detection using sensor telemetry.

These predictive capabilities require appropriate datasets, model training, and validation before being used for operational recommendations.

---

## 🔌 IoT and Hardware Design

The AIoT Design Lab provides a conceptual environment for designing irrigation-related hardware systems.

Potential hardware components include:

- Soil moisture sensors.
- Temperature and humidity sensors.
- Water flow sensors.
- Water level sensors.
- Microcontrollers.
- Solar panels.
- Water pumps.
- Communication modules.

The design environment supports component selection, conceptual connections, documentation, and starter firmware generation.

**Important:** Hardware designs and generated firmware are conceptual starting points. They require engineering review, electrical validation, compilation, calibration, and physical testing before real-world deployment.

Live sensor ingestion and physical irrigation control should not be assumed unless separately implemented and tested.

---

## ⚙️ Installation and Setup

### Prerequisites

Install the following tools:

- Python 3.10 or later.
- Node.js and npm.
- Git.
- PostgreSQL (optional when using SQLite).
- Docker and Docker Compose (optional).
- Expo Go on an Android or iOS device for mobile testing.

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/ResiliFarm-AI.git

cd ResiliFarm-AI
```

Replace `YOUR_USERNAME` with the repository owner's GitHub username.

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate it on Windows:

```bash
venv\Scripts\activate
```

Activate it on Linux or macOS:

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Configure the environment variables according to the project's environment configuration.

Start the FastAPI server:

```bash
uvicorn app.main:app --reload
```

The backend API should be available at:

```text
http://127.0.0.1:8000
```

FastAPI documentation:

```text
http://127.0.0.1:8000/docs
```

### 3. Web Application Setup

Open another terminal and navigate to the web application directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The web application will be available at the local URL displayed by Vite.

### 4. Mobile Application Setup

Open another terminal and navigate to the React Native application directory:

```bash
cd mobile
```

Install dependencies:

```bash
npm install
```

Start Expo:

```bash
npx expo start
```

To test the application:

1. Install Expo Go on your smartphone.
2. Connect your smartphone and computer to the same network.
3. Scan the QR code displayed in the terminal.
4. Open the application through Expo Go.

**Important:** When testing on a physical smartphone, configure the mobile application's API base URL to use your computer's local network IP address instead of `localhost`.

For example:

```text
http://192.168.1.10:8000
```

The address above is only an example. Use the actual local IP address of your development computer.

### 5. Database Setup

ResiliFarm supports PostgreSQL and SQLite configurations.

For PostgreSQL, configure the database connection string in the backend environment settings.

Example:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/resilifarm
```

For local development, SQLite can be used when supported by the current backend configuration.

### 6. Optional AI Setup

The AI-assisted Studio can optionally use Ollama.

Install Ollama, then pull the configured model:

```bash
ollama pull qwen3:4b
```

Start the local Ollama service:

```bash
ollama serve
```

Ensure that the backend is configured to communicate with the local Ollama endpoint.

The platform's core functionality should not be assumed to require the optional local AI model.

---

## 📂 Project Structure

The following is an illustrative high-level structure. Directory names should match the actual repository.

```text
ResiliFarm-AI/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── mobile/
│   ├── app/
│   ├── components/
│   ├── assets/
│   ├── package.json
│   └── app.json
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   │
│   ├── tests/
│   └── requirements.txt
│
├── docker-compose.yml
├── README.md
└── .gitignore
```

---

## 🧪 Testing

Testing should cover the main application components:

- Backend API endpoints.
- Agricultural calculation services.
- Database initialization.
- Data validation.
- Authentication and role-based access.
- Web application build.
- Mobile application navigation and API integration.
- Scenario simulation logic.

The repository's documented backend test suite includes 55 tests. Actual test results should be verified against the current source code and environment.

---

## ⚠️ Limitations and Assumptions

ResiliFarm AI is a decision-support project and should be evaluated according to the current implementation.

Important considerations:

- Some agricultural coefficients and thresholds are illustrative and require local calibration.
- Water network calculations are simplified estimates, not a validated hydraulic simulation.
- Scenario simulations do not guarantee real-world outcomes.
- Weather information depends on external data availability.
- Sample data may be used when external services are unavailable.
- Optional AI assistance depends on local model availability.
- Generated hardware configurations require engineering validation.
- Predictive machine-learning models require appropriate datasets and validation.
- Physical sensor integration and automated irrigation control must be separately implemented and tested.
- The application should not be considered a production-ready agricultural control system without further validation, security hardening, and field testing.

---

## 🔮 Future Improvements

Potential development directions include:

- Real-time IoT sensor integration.
- Soil moisture forecasting using machine learning.
- Improved crop water demand prediction.
- More advanced drought and water-stress prediction.
- Validated hydraulic network simulation.
- Automated irrigation integration with safe control mechanisms.
- Improved offline functionality for farmers.
- Push notifications for agricultural alerts.
- Additional crop models and locally calibrated agricultural datasets.
- Localization for Tunisian and Japanese agricultural contexts.
- Expanded cybersecurity monitoring for connected agricultural devices.
- Field testing and collaboration with agricultural experts.

---

## 🌏 Tunisia × Japan: A Shared Vision

ResiliFarm AI was designed around agricultural resilience and responsible water management.

Water scarcity and climate-related agricultural challenges affect farming communities across different regions.

The platform aims to provide a flexible foundation that can be adapted to different agricultural contexts.

For deployment in Japan or other countries, local crop parameters, agricultural practices, irrigation methods, and environmental datasets must be adapted and validated.

---

## 🌱 Our Vision

We believe agricultural resilience starts with better decisions.

By connecting agricultural intelligence, water management, energy awareness, and accessible technology, ResiliFarm AI aims to help farmers and agronomists make more informed decisions about one of our most valuable resources.

**Water is limited. Agricultural resilience should not be.**

**ResiliFarm AI — Making every drop count.**

---

## 👩‍💻 Contributors

Developed as part of the KIZUNA 2026 Tunisia × Japan Hackathon.

Add contributor names and GitHub profiles here.

---

## 📄 License

A license has not yet been specified.

Add a `LICENSE` file before distributing the project under an open-source license.

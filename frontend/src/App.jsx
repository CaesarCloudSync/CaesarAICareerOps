import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import StatsOverview from './components/StatsOverview';
import ApplicationsTable from './components/ApplicationsTable';
import JobEvaluator from './components/JobEvaluator';
import PipelineInbox from './components/PipelineInbox';
import ReportsViewer from './components/ReportsViewer';
import CvEditor from './components/CvEditor';
import DiscoverySettingsView from './components/DiscoverySettingsView';
import AgyAuthModal from './components/AgyAuthModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('pipeline');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [health, setHealth] = useState({ provider: 'PostgreSQL' });
  const [applications, setApplications] = useState([]);
  const [pipelineItems, setPipelineItems] = useState([]);
  const [reports, setReports] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [prefillJd, setPrefillJd] = useState('');

  const loadData = async () => {
    try {
      const [statsRes, appsRes, pipeRes, repRes, pdfRes, healthRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/applications'),
        fetch('/api/pipeline'),
        fetch('/api/reports'),
        fetch('/api/pdfs'),
        fetch('/api/health'),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (appsRes.ok) setApplications(await appsRes.json());
      if (pipeRes.ok) setPipelineItems(await pipeRes.json());
      if (repRes.ok) setReports(await repRes.json());
      if (pdfRes.ok) setPdfs(await pdfRes.json());
      if (healthRes.ok) setHealth(await healthRes.json());
    } catch (err) {
      console.error('Error fetching dashboard data', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (company, role, newStatus) => {
    try {
      const res = await fetch('/api/applications/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, role, status: newStatus }),
      });
      if (res.ok) {
        loadData();
      }
    } catch (err) {
      console.error('Error updating status', err);
    }
  };

  const handleSendToEvaluator = (inputData) => {
    setPrefillJd(inputData);
    setActiveTab('evaluator');
  };

  const handleViewReport = (reportFilename) => {
    setActiveTab('reports');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        health={health}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <StatsOverview stats={stats} onSelectTab={setActiveTab} />

        {activeTab === 'tracker' && (
          <ApplicationsTable
            applications={applications}
            onStatusChange={handleStatusChange}
            onViewReport={handleViewReport}
          />
        )}

        {activeTab === 'evaluator' && (
          <JobEvaluator
            prefillJd={prefillJd}
            clearPrefill={() => setPrefillJd('')}
            onEvaluationComplete={loadData}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}

        {activeTab === 'pipeline' && (
          <PipelineInbox
            items={pipelineItems}
            onSendToEvaluator={handleSendToEvaluator}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsViewer
            reports={reports}
            pdfs={pdfs}
            onRefresh={loadData}
          />
        )}

        {(activeTab === 'settings' || activeTab === 'cv') && <DiscoverySettingsView />}
      </main>

      <AgyAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={loadData}
      />

      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500 font-mono">
        CaesarAICareerOps • FastAPI + React • Decoupled Data Layer • PostgreSQL / Supabase
      </footer>
    </div>
  );
}

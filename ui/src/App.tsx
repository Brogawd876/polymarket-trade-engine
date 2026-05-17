import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LiveMonitor } from './components/LiveMonitor/LiveMonitor';
import ControlCenter from './pages/ControlCenter';
import ReplayLab from './pages/ReplayLab';
import StrategyLab from './pages/StrategyLab';

import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Logs from './pages/Logs';

// Placeholders for other routes
const Placeholder = ({ title }: { title: string }) => (
    <div className="p-8 flex items-center justify-center h-full text-slate-500 text-lg font-medium">
        {title} (Coming Soon)
    </div>
);

export function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<AppLayout />}>
                    <Route index element={<LiveMonitor />} />
                    <Route path="controls" element={<ControlCenter />} />
                    <Route path="replay" element={<ReplayLab />} />
                    <Route path="strategy" element={<StrategyLab />} />
                    <Route path="analytics" element={<Analytics />} />     
                    <Route path="logs" element={<Logs />} />
                    <Route path="settings" element={<Settings />} />    
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;

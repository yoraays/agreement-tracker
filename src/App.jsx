import React, { useState, useEffect } from 'react';
import { Upload, FileText, Calendar, Mail, AlertCircle, Trash2, Edit, Plus, X, Building2, FolderOpen, Bell } from 'lucide-react';

const AgreementTracker = () => {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedAgreement, setEditedAgreement] = useState(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [emailSettings, setEmailSettings] = useState({ email: '', reminderDays1: 90, reminderDays2: 30 });
  const [showEmailSettings, setShowEmailSettings] = useState(false);

  useEffect(() => {
    loadAgreements();
    loadEmailSettings();
  }, []);

  const loadAgreements = async () => {
    try {
      const result = await window.storage.list('agreement:');
      if (result && result.keys) {
        const loadedAgreements = await Promise.all(
          result.keys.map(async (key) => {
            const data = await window.storage.get(key);
            return data ? JSON.parse(data.value) : null;
          })
        );
        setAgreements(loadedAgreements.filter(a => a !== null));
      }
    } catch (error) {
      console.log('No existing agreements found');
    }
  };

  const loadEmailSettings = async () => {
    try {
      const result = await window.storage.get('email-settings');
      if (result) {
        setEmailSettings(JSON.parse(result.value));
      }
    } catch (error) {
      console.log('No email settings found');
    }
  };

  const handleFileUpload = async (event, company) => {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    setExtracting(true);
    setLoading(true);

    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: 'Extract agreement info as JSON: {"parties":["p1","p2"],"agreementType":"type","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","counterpartyName":"name","counterpartyEmail":"email","keyTerms":"summary","autoRenewal":true,"company":"Ansher Investments LLP or Ansher Capital LLC"}. Use null for missing fields.'
              }
            ]
          }]
        })
      });

      const data = await response.json();
      const textContent = data.content.filter(item => item.type === 'text').map(item => item.text).join('');
      const cleanedText = textContent.replace(/```json|```/g, '').trim();
      const extractedData = JSON.parse(cleanedText);

      const newAgreement = {
        id: Date.now().toString(),
        fileName: file.name,
        uploadDate: new Date().toISOString(),
        company: company || extractedData.company || 'Ansher Investments LLP',
        reminderSent1: false,
        reminderSent2: false,
        pdfData: base64Data,
        ...extractedData
      };

      await window.storage.set('agreement:' + newAgreement.id, JSON.stringify(newAgreement));
      setAgreements([...agreements, newAgreement]);
      setExtracting(false);
      setLoading(false);
      alert('Agreement extracted successfully!');
    } catch (error) {
      console.error('Extraction error:', error);
      alert('Failed to extract agreement details.');
      setExtracting(false);
      setLoading(false);
    }
  };

  const saveAgreement = async (agreement) => {
    try {
      await window.storage.set('agreement:' + agreement.id, JSON.stringify(agreement));
      setAgreements(agreements.map(a => a.id === agreement.id ? agreement : a));
      setEditMode(false);
      setSelectedAgreement(agreement);
      alert('Agreement updated!');
    } catch (error) {
      alert('Failed to save agreement');
    }
  };

  const deleteAgreement = async (id) => {
    if (window.confirm('Delete this agreement?')) {
      try {
        await window.storage.delete('agreement:' + id);
        setAgreements(agreements.filter(a => a.id !== id));
        setSelectedAgreement(null);
      } catch (error) {
        console.error('Delete error:', error);
      }
    }
  };

  const getDaysUntilExpiry = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const today = new Date();
    return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatus = (agreement) => {
    if (agreement.activeUntilTerminated) {
      return { color: 'blue', text: 'Active until terminated' };
    }
    const days = getDaysUntilExpiry(agreement.endDate);
    if (days === null) return { color: 'gray', text: 'No end date' };
    if (days < 0) return { color: 'red', text: 'Expired' };
    if (days <= 30) return { color: 'orange', text: days + ' days left' };
    if (days <= 90) return { color: 'yellow', text: days + ' days left' };
    return { color: 'green', text: days + ' days left' };
  };

  const downloadPDF = (agreement) => {
    if (!agreement.pdfData) {
      alert('No PDF file stored for this agreement');
      return;
    }
    
    const link = document.createElement('a');
    link.href = 'data:application/pdf;base64,' + agreement.pdfData;
    link.download = agreement.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sendReminderEmail = async (agreement) => {
    const subject = 'Agreement Expiring: ' + (agreement.counterpartyName || agreement.agreementType);
    const body = 'Company: ' + agreement.company + '\nCounterparty: ' + (agreement.counterpartyName || 'Unknown') + '\nType: ' + agreement.agreementType + '\nExpires: ' + new Date(agreement.endDate).toLocaleDateString() + '\nDays left: ' + getDaysUntilExpiry(agreement.endDate);
    
    window.open('mailto:' + emailSettings.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
  };

  const checkAndSendReminders = () => {
    if (!emailSettings.email) {
      alert('Please set your email address in Email Settings first');
      return;
    }

    let remindersSent = 0;
    
    agreements.forEach(async (agreement) => {
      const daysUntil = getDaysUntilExpiry(agreement.endDate);
      if (daysUntil === null || daysUntil < 0) return;

      let updated = { ...agreement };
      let needsUpdate = false;

      // Check first reminder
      if (!agreement.reminderSent1 && daysUntil <= emailSettings.reminderDays1) {
        sendReminderEmail(agreement);
        updated.reminderSent1 = true;
        needsUpdate = true;
        remindersSent++;
      }

      // Check second reminder
      if (!agreement.reminderSent2 && daysUntil <= emailSettings.reminderDays2) {
        sendReminderEmail(agreement);
        updated.reminderSent2 = true;
        needsUpdate = true;
        remindersSent++;
      }

      if (needsUpdate) {
        await window.storage.set('agreement:' + agreement.id, JSON.stringify(updated));
        setAgreements(prev => prev.map(a => a.id === agreement.id ? updated : a));
      }
    });

    if (remindersSent > 0) {
      alert(remindersSent + ' reminder email(s) opened. Please send them from your email client.');
    } else {
      alert('No reminders to send at this time.');
    }
  };

  const expiredAgreements = agreements.filter(a => {
    if (a.activeUntilTerminated) return false;
    const days = getDaysUntilExpiry(a.endDate);
    return days !== null && days < 0;
  });

  const filteredAgreements = selectedCompany === 'all' 
    ? agreements 
    : selectedCompany === 'expired' 
    ? expiredAgreements
    : agreements.filter(a => a.company === selectedCompany);

  const groupedByType = filteredAgreements.reduce((acc, agreement) => {
    const type = agreement.agreementType || 'Uncategorized';
    if (!acc[type]) acc[type] = [];
    acc[type].push(agreement);
    return acc;
  }, {});

  const upcomingExpirations = filteredAgreements.filter(a => {
    const days = getDaysUntilExpiry(a.endDate);
    return days !== null && days >= 0 && days <= 90;
  }).sort((a, b) => getDaysUntilExpiry(a.endDate) - getDaysUntilExpiry(b.endDate));

  const toggleCategory = (type) => {
    setExpandedCategories(prev => ({ ...prev, [type]: !prev[type] }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Agreement Tracker</h1>
              <p className="text-gray-600">Ansher Investments LLP & Ansher Capital LLC</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowEmailSettings(true)} className="bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700 flex items-center gap-2">
                <Bell size={20} />
                Email Settings
              </button>
              <button onClick={() => setShowManualEntry(true)} className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 flex items-center gap-2">
                <Plus size={20} />
                Manual Entry
              </button>
            </div>
          </div>

          <div className="flex gap-3 mb-4">
            <button onClick={() => setSelectedCompany('all')} className={'px-4 py-2 rounded-lg ' + (selectedCompany === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700')}>
              All Companies
            </button>
            <button onClick={() => setSelectedCompany('Ansher Investments LLP')} className={'px-4 py-2 rounded-lg flex items-center gap-2 ' + (selectedCompany === 'Ansher Investments LLP' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700')}>
              <Building2 size={16} />
              AI LLP
            </button>
            <button onClick={() => setSelectedCompany('Ansher Capital LLC')} className={'px-4 py-2 rounded-lg flex items-center gap-2 ' + (selectedCompany === 'Ansher Capital LLC' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700')}>
              <Building2 size={16} />
              AC LLC
            </button>
            <button onClick={() => setSelectedCompany('expired')} className={'px-4 py-2 rounded-lg ' + (selectedCompany === 'expired' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700')}>
              Expired
            </button>
          </div>

          <div className="flex gap-3">
            <label className="cursor-pointer bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Upload size={20} />
              Upload for AI LLP
              <input type="file" accept=".pdf" onChange={(e) => handleFileUpload(e, 'Ansher Investments LLP')} className="hidden" disabled={loading} />
            </label>
            <label className="cursor-pointer bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center gap-2">
              <Upload size={20} />
              Upload for AC LLC
              <input type="file" accept=".pdf" onChange={(e) => handleFileUpload(e, 'Ansher Capital LLC')} className="hidden" disabled={loading} />
            </label>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{filteredAgreements.length}</div>
              <div className="text-sm text-gray-600">{selectedCompany === 'expired' ? 'Expired' : 'Total'}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600">{agreements.filter(a => a.company === 'Ansher Investments LLP').length}</div>
              <div className="text-sm text-gray-600">AI LLP</div>
            </div>
            <div className="bg-indigo-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-indigo-600">{agreements.filter(a => a.company === 'Ansher Capital LLC').length}</div>
              <div className="text-sm text-gray-600">AC LLC</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-600">{upcomingExpirations.length}</div>
              <div className="text-sm text-gray-600">Expiring Soon</div>
            </div>
          </div>
        </div>

        {extracting && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-blue-800">Extracting agreement details...</span>
            </div>
          </div>
        )}

        {upcomingExpirations.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <AlertCircle className="text-orange-600 mt-1" size={20} />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 mb-2">Upcoming Expirations</h3>
                {upcomingExpirations.slice(0, 3).map(agreement => (
                  <div key={agreement.id} className="text-sm text-orange-800 mb-1">
                    <strong>{agreement.company}</strong> - {agreement.counterpartyName || 'Unknown'} ({agreement.agreementType}) expires in {getDaysUntilExpiry(agreement.endDate)} days
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">
              {selectedCompany === 'all' ? 'All Agreements' : 
               selectedCompany === 'expired' ? 'Expired Agreements' : 
               selectedCompany}
            </h2>
            
            {filteredAgreements.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 opacity-50" />
                <p>No agreements yet. Upload your first agreement.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedByType).map(([type, typeAgreements]) => (
                  <div key={type} className="border rounded-lg">
                    <button onClick={() => toggleCategory(type)} className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100">
                      <div className="flex items-center gap-3">
                        <FolderOpen size={20} className="text-gray-600" />
                        <span className="font-semibold">{type}</span>
                        <span className="px-2 py-1 bg-gray-200 text-xs rounded-full">{typeAgreements.length}</span>
                      </div>
                      <span>{expandedCategories[type] ? '−' : '+'}</span>
                    </button>
                    
                    {expandedCategories[type] && (
                      <div className="p-4 space-y-3">
                        {typeAgreements.map(agreement => {
                          const status = getExpiryStatus(agreement);
                          return (
                            <div key={agreement.id} className="border rounded-lg p-4 hover:shadow cursor-pointer" onClick={() => setSelectedAgreement(agreement)}>
                              <div className="flex justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h3 className="font-semibold">{agreement.counterpartyName || 'Unknown'}</h3>
                                    <span className={'px-3 py-1 text-xs rounded-full ' + (agreement.company === 'Ansher Investments LLP' ? 'bg-purple-100 text-purple-800' : 'bg-indigo-100 text-indigo-800')}>
                                      {agreement.company === 'Ansher Investments LLP' ? 'AI LLP' : 'AC LLC'}
                                    </span>
                                    <span className={'px-3 py-1 text-xs rounded-full ' + (status.color === 'red' ? 'bg-red-100 text-red-800' : status.color === 'orange' ? 'bg-orange-100 text-orange-800' : status.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' : status.color === 'blue' ? 'bg-blue-100 text-blue-800' : status.color === 'green' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800')}>
                                      {status.text}
                                    </span>
                                  </div>
                                  <div className="flex gap-6 text-sm text-gray-600">
                                    {agreement.counterpartyEmail && (
                                      <div className="flex items-center gap-1">
                                        <Mail size={14} />
                                        {agreement.counterpartyEmail}
                                      </div>
                                    )}
                                    {agreement.endDate && !agreement.activeUntilTerminated && (
                                      <div className="flex items-center gap-1">
                                        <Calendar size={14} />
                                        Expires: {new Date(agreement.endDate).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); deleteAgreement(agreement.id); }} className="text-red-600 p-2">
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedAgreement && (
          <AgreementModal
            agreement={selectedAgreement}
            editMode={editMode}
            onClose={() => { setSelectedAgreement(null); setEditMode(false); }}
            onEdit={() => { setEditedAgreement({...selectedAgreement}); setEditMode(true); }}
            onSave={saveAgreement}
            editedAgreement={editedAgreement}
            setEditedAgreement={setEditedAgreement}
            onDownload={downloadPDF}
          />
        )}

        {showManualEntry && <ManualEntryModal onClose={() => setShowManualEntry(false)} onCreate={async (agr) => {
          const newAgr = { ...agr, id: Date.now().toString(), uploadDate: new Date().toISOString(), fileName: 'Manual', reminderSent1: false, reminderSent2: false };
          await window.storage.set('agreement:' + newAgr.id, JSON.stringify(newAgr));
          setAgreements([...agreements, newAgr]);
          setShowManualEntry(false);
        }} />}

        {showEmailSettings && <EmailSettingsModal settings={emailSettings} onSave={async (s) => {
          await window.storage.set('email-settings', JSON.stringify(s));
          setEmailSettings(s);
          setShowEmailSettings(false);
        }} onClose={() => setShowEmailSettings(false)} />}
      </div>
    </div>
  );
};

const AgreementModal = ({ agreement, editMode, onClose, onEdit, onSave, editedAgreement, setEditedAgreement, onDownload }) => {
  const disp = editMode ? editedAgreement : agreement;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between mb-6">
            <h2 className="text-2xl font-bold">Agreement Details</h2>
            <div className="flex gap-2">
              {!editMode ? <button onClick={onEdit} className="text-blue-600 p-2"><Edit size={20} /></button> : <button onClick={() => onSave(editedAgreement)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save</button>}
              <button onClick={onClose} className="text-gray-400 p-2"><X size={24} /></button>
            </div>
          </div>

          <div className="space-y-4">
            <Field label="Company" value={disp.company} editMode={editMode} onChange={(v) => setEditedAgreement({...editedAgreement, company: v})} type="select" options={['Ansher Investments LLP', 'Ansher Capital LLC']} />
            <Field label="Type" value={disp.agreementType} editMode={editMode} onChange={(v) => setEditedAgreement({...editedAgreement, agreementType: v})} />
            <Field label="Counterparty" value={disp.counterpartyName} editMode={editMode} onChange={(v) => setEditedAgreement({...editedAgreement, counterpartyName: v})} />
            <Field label="Email" value={disp.counterpartyEmail} editMode={editMode} onChange={(v) => setEditedAgreement({...editedAgreement, counterpartyEmail: v})} type="email" />
            
            {editMode && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <input
                  type="checkbox"
                  checked={disp.activeUntilTerminated || false}
                  onChange={(e) => setEditedAgreement({...editedAgreement, activeUntilTerminated: e.target.checked, endDate: e.target.checked ? null : disp.endDate})}
                  className="w-4 h-4"
                  id="activeUntilTerminated"
                />
                <label htmlFor="activeUntilTerminated" className="text-sm font-semibold text-gray-700 cursor-pointer">
                  This agreement is active until terminated (no expiration date)
                </label>
              </div>
            )}
            
            {!disp.activeUntilTerminated && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Start" value={disp.startDate} editMode={editMode} onChange={(v) => setEditedAgreement({...editedAgreement, startDate: v})} type="date" />
                <Field label="End" value={disp.endDate} editMode={editMode} onChange={(v) => setEditedAgreement({...editedAgreement, endDate: v})} type="date" />
              </div>
            )}
            
            {disp.activeUntilTerminated && !editMode && (
              <div>
                <label className="text-sm font-semibold text-gray-700">Status</label>
                <p className="text-blue-600 font-semibold">Active until terminated</p>
              </div>
            )}
            
            <Field label="Key Terms" value={disp.keyTerms} editMode={editMode} onChange={(v) => setEditedAgreement({...editedAgreement, keyTerms: v})} type="textarea" />
            
            {disp.pdfData && !editMode && (
              <div className="pt-4 border-t">
                <button onClick={() => onDownload(agreement)} className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2">
                  <FileText size={18} />
                  Download PDF Agreement
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, value, editMode, onChange, type = 'text', options = [] }) => {
  if (!editMode) return <div><label className="text-sm font-semibold text-gray-700">{label}</label><p className="text-gray-900">{type === 'date' && value ? new Date(value).toLocaleDateString() : value || 'Not specified'}</p></div>;
  if (type === 'select') return <div><label className="text-sm font-semibold block mb-1">{label}</label><select value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full border rounded-lg p-2">{options.map(o => <option key={o} value={o}>{o}</option>)}</select></div>;
  if (type === 'textarea') return <div><label className="text-sm font-semibold block mb-1">{label}</label><textarea value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full border rounded-lg p-2" rows="4" /></div>;
  return <div><label className="text-sm font-semibold block mb-1">{label}</label><input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full border rounded-lg p-2" /></div>;
};

const ManualEntryModal = ({ onClose, onCreate }) => {
  const [form, setForm] = useState({ company: 'Ansher Investments LLP', agreementType: '', counterpartyName: '', counterpartyEmail: '', startDate: '', endDate: '', keyTerms: '', autoRenewal: false, parties: [], activeUntilTerminated: false });
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between mb-6">
            <h2 className="text-2xl font-bold">Manual Entry</h2>
            <button onClick={onClose} className="text-gray-400 p-2"><X size={24} /></button>
          </div>
          <div className="space-y-4">
            <Field label="Company" value={form.company} editMode={true} onChange={(v) => setForm({...form, company: v})} type="select" options={['Ansher Investments LLP', 'Ansher Capital LLC']} />
            <Field label="Type" value={form.agreementType} editMode={true} onChange={(v) => setForm({...form, agreementType: v})} />
            <Field label="Counterparty" value={form.counterpartyName} editMode={true} onChange={(v) => setForm({...form, counterpartyName: v})} />
            <Field label="Email" value={form.counterpartyEmail} editMode={true} onChange={(v) => setForm({...form, counterpartyEmail: v})} type="email" />
            
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                checked={form.activeUntilTerminated}
                onChange={(e) => setForm({...form, activeUntilTerminated: e.target.checked, endDate: e.target.checked ? '' : form.endDate})}
                className="w-4 h-4"
                id="manualActiveUntilTerminated"
              />
              <label htmlFor="manualActiveUntilTerminated" className="text-sm font-semibold text-gray-700 cursor-pointer">
                This agreement is active until terminated (no expiration date)
              </label>
            </div>
            
            {!form.activeUntilTerminated && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Start" value={form.startDate} editMode={true} onChange={(v) => setForm({...form, startDate: v})} type="date" />
                <Field label="End" value={form.endDate} editMode={true} onChange={(v) => setForm({...form, endDate: v})} type="date" />
              </div>
            )}
            
            <Field label="Key Terms" value={form.keyTerms} editMode={true} onChange={(v) => setForm({...form, keyTerms: v})} type="textarea" />
            <button onClick={() => onCreate(form)} className="w-full bg-blue-600 text-white py-2 rounded-lg">Create</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EmailSettingsModal = ({ settings, onSave, onClose }) => {
  const [form, setForm] = useState(settings);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between mb-6">
            <h2 className="text-2xl font-bold">Email Settings</h2>
            <button onClick={onClose} className="text-gray-400 p-2"><X size={24} /></button>
          </div>
          <div className="space-y-4">
            <Field label="Your Email" value={form.email} editMode={true} onChange={(v) => setForm({...form, email: v})} type="email" />
            <div>
              <label className="text-sm font-semibold block mb-1">First Reminder (Days Before Expiry)</label>
              <input type="number" value={form.reminderDays1} onChange={(e) => setForm({...form, reminderDays1: parseInt(e.target.value)})} className="w-full border rounded-lg p-2" />
              <p className="text-xs text-gray-500 mt-1">E.g., 90 days = 3 months before expiry</p>
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Second Reminder (Days Before Expiry)</label>
              <input type="number" value={form.reminderDays2} onChange={(e) => setForm({...form, reminderDays2: parseInt(e.target.value)})} className="w-full border rounded-lg p-2" />
              <p className="text-xs text-gray-500 mt-1">E.g., 30 days = 1 month before expiry</p>
            </div>
            <button onClick={() => onSave(form)} className="w-full bg-blue-600 text-white py-2 rounded-lg">Save Settings</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgreementTracker;

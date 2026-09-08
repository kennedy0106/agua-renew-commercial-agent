/** Interfaz del repositorio de leads (puerto de persistencia). */

export class LeadRepository {
  async createLead() { throw new Error('Not implemented'); }
  async findLeadById() { throw new Error('Not implemented'); }
  async findLeadByExternalConversation() { throw new Error('Not implemented'); }
  async findLeadByPhone() { throw new Error('Not implemented'); }
  async updateLead() { throw new Error('Not implemented'); }
  async appendMessage() { throw new Error('Not implemented'); }
  async enqueueOutbound() { throw new Error('Not implemented'); }
  async listMessages() { throw new Error('Not implemented'); }
  async appendEvent() { throw new Error('Not implemented'); }
  async listEvents() { throw new Error('Not implemented'); }
  async recordPhoneHistory() { throw new Error('Not implemented'); }
  async listPhoneHistory() { throw new Error('Not implemented'); }
  async listLeads() { throw new Error('Not implemented'); }
  async countLeads() { throw new Error('Not implemented'); }
  async countLeadsByStatus() { throw new Error('Not implemented'); }
  async deleteLead() { throw new Error('Not implemented'); }
  async claimDueOutbound() { throw new Error('Not implemented'); }
  async markOutboundSent() { throw new Error('Not implemented'); }
  async markOutboundRetry() { throw new Error('Not implemented'); }
  async markOutboundFailed() { throw new Error('Not implemented'); }
  async recordOutboundOutcome() { throw new Error('Not implemented'); }
  async applyHistoricalAnalysis() { throw new Error('Not implemented'); }
  async retryOutbound() { throw new Error('Not implemented'); }
  async close() { throw new Error('Not implemented'); }
}

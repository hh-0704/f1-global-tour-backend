import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { RaceControlQueryParams } from '../../common/interfaces/query-params.interface';

@Injectable()
export class RaceControlService {
  private readonly logger = new Logger(RaceControlService.name);

  constructor(private readonly cachedOpenf1Client: CachedOpenF1ClientService) {}

  async getSessionRaceControl(sessionKey: number, date?: string) {
    try {
      const params: RaceControlQueryParams = {
        session_key: sessionKey,
        ...(date && { date }),
      };

      this.logger.debug(`Fetching race control messages for session ${sessionKey}`);
      const raceControlData = await this.cachedOpenf1Client.fetchRaceControl(params);

      const transformedData = raceControlData.map(message => this.transformRaceControlMessage(message));
      
      // Sort by timestamp
      transformedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      this.logger.log(`Retrieved ${transformedData.length} race control messages for session ${sessionKey}`);
      return {
        sessionKey,
        totalMessages: transformedData.length,
        messages: transformedData,
        summary: this.generateRaceControlSummary(transformedData),
      };
    } catch (error) {
      this.logger.error(`Error fetching race control data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch race control data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getFlags(sessionKey: number, date?: string) {
    try {
      this.logger.debug(`Fetching flag information for session ${sessionKey}`);
      const raceControlData = await this.getSessionRaceControl(sessionKey, date);

      const flagMessages = raceControlData.messages.filter(message => 
        this.isFlag(message.message)
      );

      const flagPeriods = this.analyzeFlagPeriods(flagMessages);

      this.logger.log(`Found ${flagMessages.length} flag-related messages`);
      return {
        sessionKey,
        totalFlagMessages: flagMessages.length,
        flagMessages,
        flagPeriods,
        flagSummary: this.generateFlagSummary(flagMessages),
      };
    } catch (error) {
      this.logger.error(`Error fetching flag data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch flag data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getIncidents(sessionKey: number, date?: string) {
    try {
      this.logger.debug(`Fetching incident information for session ${sessionKey}`);
      const raceControlData = await this.getSessionRaceControl(sessionKey, date);

      const incidentMessages = raceControlData.messages.filter(message =>
        this.isIncident(message.message)
      );

      const categorizedIncidents = this.categorizeIncidents(incidentMessages);

      this.logger.log(`Found ${incidentMessages.length} incident-related messages`);
      return {
        sessionKey,
        totalIncidents: incidentMessages.length,
        incidents: incidentMessages,
        categorizedIncidents,
        incidentTimeline: this.createIncidentTimeline(incidentMessages),
      };
    } catch (error) {
      this.logger.error(`Error fetching incident data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch incident data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getSafetyCarPeriods(sessionKey: number, date?: string) {
    try {
      this.logger.debug(`Analyzing safety car periods for session ${sessionKey}`);
      const raceControlData = await this.getSessionRaceControl(sessionKey, date);

      const safetyCarMessages = raceControlData.messages.filter(message =>
        this.isSafetyCarMessage(message.message)
      );

      const safetyCarPeriods = this.analyzeSafetyCarPeriods(safetyCarMessages);
      const virtualSafetyCarPeriods = this.analyzeVirtualSafetyCarPeriods(safetyCarMessages);

      this.logger.log(`Found ${safetyCarPeriods.length} safety car periods and ${virtualSafetyCarPeriods.length} VSC periods`);
      return {
        sessionKey,
        safetyCarPeriods,
        virtualSafetyCarPeriods,
        totalSafetyCarTime: safetyCarPeriods.reduce((total, period: any) => total + (period.duration || 0), 0),
        totalVSCTime: virtualSafetyCarPeriods.reduce((total, period: any) => total + (period.duration || 0), 0),
        messages: safetyCarMessages,
      };
    } catch (error) {
      this.logger.error(`Error analyzing safety car periods:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze safety car periods',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getRaceTimeline(sessionKey: number, startDate?: string, endDate?: string) {
    try {
      this.logger.debug(`Creating race timeline for session ${sessionKey}`);
      const raceControlData = await this.getSessionRaceControl(sessionKey);

      let filteredMessages = raceControlData.messages;

      // Filter by date range if provided
      if (startDate || endDate) {
        filteredMessages = raceControlData.messages.filter(message => {
          const messageTime = new Date(message.timestamp).getTime();
          const start = startDate ? new Date(startDate).getTime() : 0;
          const end = endDate ? new Date(endDate).getTime() : Date.now();
          
          return messageTime >= start && messageTime <= end;
        });
      }

      const timeline = filteredMessages.map(message => ({
        timestamp: message.timestamp,
        type: this.categorizeMessage(message.message),
        message: message.message,
        category: message.category,
        flag: message.flag,
        scope: message.scope,
        sector: message.sector,
      }));

      // Group by time intervals (e.g., every 5 minutes)
      const timeGroups = this.groupTimelineByInterval(timeline, 5 * 60 * 1000); // 5 minutes

      this.logger.log(`Created timeline with ${timeline.length} events in ${Object.keys(timeGroups).length} time intervals`);
      return {
        sessionKey,
        dateRange: {
          start: startDate || (filteredMessages.length > 0 ? filteredMessages[0].timestamp : null),
          end: endDate || (filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].timestamp : null),
        },
        totalEvents: timeline.length,
        timeline,
        timeGroups,
        eventTypes: this.getEventTypeSummary(timeline),
      };
    } catch (error) {
      this.logger.error(`Error creating race timeline:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to create race timeline',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getPenalties(sessionKey: number, driverNumber?: number) {
    try {
      this.logger.debug(`Fetching penalty information for session ${sessionKey}${driverNumber ? ` and driver ${driverNumber}` : ''}`);
      const raceControlData = await this.getSessionRaceControl(sessionKey);

      let penaltyMessages = raceControlData.messages.filter(message =>
        this.isPenalty(message.message)
      );

      if (driverNumber) {
        penaltyMessages = penaltyMessages.filter(message =>
          message.message.includes(driverNumber.toString()) ||
          message.message.includes(`CAR ${driverNumber}`)
        );
      }

      const penalties = penaltyMessages.map(message => ({
        ...message,
        penaltyType: this.extractPenaltyType(message.message),
        penaltyReason: this.extractPenaltyReason(message.message),
        affectedDriver: this.extractDriverNumber(message.message),
        severity: this.assessPenaltySeverity(message.message),
      }));

      const penaltySummary = this.generatePenaltySummary(penalties);

      this.logger.log(`Found ${penalties.length} penalty-related messages`);
      return {
        sessionKey,
        driverNumber,
        totalPenalties: penalties.length,
        penalties,
        summary: penaltySummary,
      };
    } catch (error) {
      this.logger.error(`Error fetching penalty data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch penalty data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDRSZones(sessionKey: number) {
    try {
      this.logger.debug(`Analyzing DRS zones for session ${sessionKey}`);
      const raceControlData = await this.getSessionRaceControl(sessionKey);

      const drsMessages = raceControlData.messages.filter(message =>
        this.isDRSMessage(message.message)
      );

      const drsZones = this.analyzeDRSZones(drsMessages);
      const drsActivations = this.analyzeDRSActivations(drsMessages);

      this.logger.log(`Found ${drsMessages.length} DRS-related messages`);
      return {
        sessionKey,
        drsMessages,
        drsZones,
        drsActivations,
        drsEnabled: drsZones.length > 0,
        totalDRSMessages: drsMessages.length,
      };
    } catch (error) {
      this.logger.error(`Error analyzing DRS zones:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze DRS zones',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private transformRaceControlMessage(message: any) {
    return {
      timestamp: message.date,
      category: message.category || 'OTHER',
      message: message.message,
      lapNumber: message.lap_number,
      flag: message.flag || null,
      scope: message.scope || null,
      sector: message.sector || null,
      driverNumber: this.extractDriverNumber(message.message),
      sessionKey: message.session_key,
      meetingKey: message.meeting_key,
    };
  }

  private generateRaceControlSummary(messages: any[]) {
    const categories = messages.reduce((counts, message) => {
      const category = message.category;
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const flagCount = messages.filter(m => this.isFlag(m.message)).length;
    const incidentCount = messages.filter(m => this.isIncident(m.message)).length;
    const penaltyCount = messages.filter(m => this.isPenalty(m.message)).length;

    return {
      totalMessages: messages.length,
      categories,
      flagMessages: flagCount,
      incidentMessages: incidentCount,
      penaltyMessages: penaltyCount,
      timeSpan: messages.length > 0 ? {
        start: messages[0].timestamp,
        end: messages[messages.length - 1].timestamp,
      } : null,
    };
  }

  private isFlag(message: string): boolean {
    const flagKeywords = [
      'YELLOW FLAG', 'RED FLAG', 'GREEN FLAG', 'CHEQUERED FLAG',
      'BLUE FLAG', 'BLACK FLAG', 'WHITE FLAG', 'TRACK CLEAR'
    ];
    return flagKeywords.some(keyword => message.toUpperCase().includes(keyword));
  }

  private isIncident(message: string): boolean {
    const incidentKeywords = [
      'INCIDENT', 'COLLISION', 'SPIN', 'OFF TRACK', 'CRASH',
      'CONTACT', 'DEBRIS', 'ACCIDENT'
    ];
    return incidentKeywords.some(keyword => message.toUpperCase().includes(keyword));
  }

  private isSafetyCarMessage(message: string): boolean {
    const safetyCarKeywords = [
      'SAFETY CAR', 'VIRTUAL SAFETY CAR', 'VSC', 'SC DEPLOYED',
      'SC IN', 'VSC DEPLOYED', 'VSC ENDING'
    ];
    return safetyCarKeywords.some(keyword => message.toUpperCase().includes(keyword));
  }

  private isPenalty(message: string): boolean {
    const penaltyKeywords = [
      'PENALTY', 'INVESTIGATION', 'REPRIMAND', 'GRID PENALTY',
      'TIME PENALTY', 'STOP GO', 'DRIVE THROUGH', 'DISQUALIFIED'
    ];
    return penaltyKeywords.some(keyword => message.toUpperCase().includes(keyword));
  }

  private isDRSMessage(message: string): boolean {
    const drsKeywords = ['DRS', 'DRAG REDUCTION SYSTEM', 'DRS ENABLED', 'DRS DISABLED'];
    return drsKeywords.some(keyword => message.toUpperCase().includes(keyword));
  }

  private categorizeMessage(message: string): string {
    if (this.isFlag(message)) return 'FLAG';
    if (this.isIncident(message)) return 'INCIDENT';
    if (this.isPenalty(message)) return 'PENALTY';
    if (this.isSafetyCarMessage(message)) return 'SAFETY_CAR';
    if (this.isDRSMessage(message)) return 'DRS';
    return 'OTHER';
  }

  private extractDriverNumber(message: string): number | null {
    // Try to extract driver number from various formats
    const patterns = [
      /CAR (\d+)/i,
      /DRIVER (\d+)/i,
      /NO\.?\s*(\d+)/i,
      /#(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }

    return null;
  }

  private analyzeFlagPeriods(flagMessages: any[]) {
    const periods: any[] = [];
    let currentFlag: string | null = null;
    let flagStart: string | null = null;

    for (const message of flagMessages) {
      const flagType = this.extractFlagType(message.message);
      
      if (flagType && flagType !== currentFlag) {
        // End previous flag period
        if (currentFlag && flagStart) {
          periods.push({
            flag: currentFlag,
            start: flagStart,
            end: message.timestamp,
            duration: new Date(message.timestamp).getTime() - new Date(flagStart).getTime(),
          });
        }
        
        // Start new flag period
        currentFlag = flagType;
        flagStart = message.timestamp;
      }
    }

    return periods;
  }

  private extractFlagType(message: string): string | null {
    const flagTypes = ['YELLOW', 'RED', 'GREEN', 'CHEQUERED', 'BLUE', 'BLACK', 'WHITE'];
    
    for (const flag of flagTypes) {
      if (message.toUpperCase().includes(`${flag} FLAG`)) {
        return flag;
      }
    }
    
    return null;
  }

  private generateFlagSummary(flagMessages: any[]) {
    const flagCounts = flagMessages.reduce((counts, message) => {
      const flagType = this.extractFlagType(message.message) || 'UNKNOWN';
      counts[flagType] = (counts[flagType] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return {
      totalFlagMessages: flagMessages.length,
      flagTypes: flagCounts,
      mostCommonFlag: Object.entries(flagCounts).reduce((most, [flag, count]) => 
        (count as number) > most.count ? { flag, count: count as number } : most,
        { flag: 'NONE', count: 0 }
      ),
    };
  }

  private categorizeIncidents(incidentMessages: any[]) {
    return {
      collisions: incidentMessages.filter(m => m.message.toUpperCase().includes('COLLISION')),
      spins: incidentMessages.filter(m => m.message.toUpperCase().includes('SPIN')),
      offTrack: incidentMessages.filter(m => m.message.toUpperCase().includes('OFF TRACK')),
      debris: incidentMessages.filter(m => m.message.toUpperCase().includes('DEBRIS')),
      other: incidentMessages.filter(m => 
        !m.message.toUpperCase().includes('COLLISION') &&
        !m.message.toUpperCase().includes('SPIN') &&
        !m.message.toUpperCase().includes('OFF TRACK') &&
        !m.message.toUpperCase().includes('DEBRIS')
      ),
    };
  }

  private createIncidentTimeline(incidentMessages: any[]) {
    return incidentMessages.map(message => ({
      timestamp: message.timestamp,
      type: this.classifyIncident(message.message),
      message: message.message,
      driverNumber: message.driverNumber,
      severity: this.assessIncidentSeverity(message.message),
    }));
  }

  private classifyIncident(message: string): string {
    if (message.toUpperCase().includes('COLLISION')) return 'COLLISION';
    if (message.toUpperCase().includes('SPIN')) return 'SPIN';
    if (message.toUpperCase().includes('OFF TRACK')) return 'OFF_TRACK';
    if (message.toUpperCase().includes('DEBRIS')) return 'DEBRIS';
    return 'OTHER';
  }

  private assessIncidentSeverity(message: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (message.toUpperCase().includes('RED FLAG') || 
        message.toUpperCase().includes('SAFETY CAR')) {
      return 'HIGH';
    }
    if (message.toUpperCase().includes('YELLOW FLAG') ||
        message.toUpperCase().includes('INVESTIGATION')) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  private analyzeSafetyCarPeriods(messages: any[]) {
    const periods: any[] = [];
    let scDeployed = false;
    let deployTime: string | null = null;

    for (const message of messages) {
      if (message.message.toUpperCase().includes('SAFETY CAR DEPLOYED') ||
          message.message.toUpperCase().includes('SC DEPLOYED')) {
        if (!scDeployed) {
          scDeployed = true;
          deployTime = message.timestamp;
        }
      } else if (message.message.toUpperCase().includes('SAFETY CAR IN') ||
                 message.message.toUpperCase().includes('SC IN')) {
        if (scDeployed && deployTime) {
          periods.push({
            type: 'SAFETY_CAR',
            deployed: deployTime,
            recalled: message.timestamp,
            duration: new Date(message.timestamp).getTime() - new Date(deployTime).getTime(),
          });
          scDeployed = false;
          deployTime = null;
        }
      }
    }

    return periods;
  }

  private analyzeVirtualSafetyCarPeriods(messages: any[]) {
    const periods: any[] = [];
    let vscDeployed = false;
    let deployTime: string | null = null;

    for (const message of messages) {
      if (message.message.toUpperCase().includes('VIRTUAL SAFETY CAR') ||
          message.message.toUpperCase().includes('VSC DEPLOYED')) {
        if (!vscDeployed) {
          vscDeployed = true;
          deployTime = message.timestamp;
        }
      } else if (message.message.toUpperCase().includes('VSC ENDING') ||
                 message.message.toUpperCase().includes('VSC ENDING')) {
        if (vscDeployed && deployTime) {
          periods.push({
            type: 'VIRTUAL_SAFETY_CAR',
            deployed: deployTime,
            ended: message.timestamp,
            duration: new Date(message.timestamp).getTime() - new Date(deployTime).getTime(),
          });
          vscDeployed = false;
          deployTime = null;
        }
      }
    }

    return periods;
  }

  private groupTimelineByInterval(timeline: any[], intervalMs: number) {
    const groups: Record<string, any[]> = {};

    for (const event of timeline) {
      const eventTime = new Date(event.timestamp).getTime();
      const intervalStart = Math.floor(eventTime / intervalMs) * intervalMs;
      const intervalKey = new Date(intervalStart).toISOString();

      if (!groups[intervalKey]) {
        groups[intervalKey] = [];
      }
      groups[intervalKey].push(event);
    }

    return groups;
  }

  private getEventTypeSummary(timeline: any[]) {
    return timeline.reduce((summary, event) => {
      const type = event.type;
      summary[type] = (summary[type] || 0) + 1;
      return summary;
    }, {} as Record<string, number>);
  }

  private extractPenaltyType(message: string): string | null {
    const penaltyTypes = [
      'GRID PENALTY', 'TIME PENALTY', 'STOP GO', 'DRIVE THROUGH',
      'REPRIMAND', 'DISQUALIFIED', 'WARNING'
    ];

    for (const type of penaltyTypes) {
      if (message.toUpperCase().includes(type)) {
        return type;
      }
    }

    return null;
  }

  private extractPenaltyReason(message: string): string | null {
    // Extract reason from common penalty message formats
    const reasonPatterns = [
      /FOR (.+?)(?:\.|$)/i,
      /REASON: (.+?)(?:\.|$)/i,
      /DUE TO (.+?)(?:\.|$)/i,
    ];

    for (const pattern of reasonPatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  private assessPenaltySeverity(message: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (message.toUpperCase().includes('DISQUALIFIED')) return 'HIGH';
    if (message.toUpperCase().includes('STOP GO') || 
        message.toUpperCase().includes('DRIVE THROUGH')) return 'HIGH';
    if (message.toUpperCase().includes('GRID PENALTY') ||
        message.toUpperCase().includes('TIME PENALTY')) return 'MEDIUM';
    return 'LOW';
  }

  private generatePenaltySummary(penalties: any[]) {
    const typeCounts = penalties.reduce((counts, penalty) => {
      const type = penalty.penaltyType || 'UNKNOWN';
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const severityCounts = penalties.reduce((counts, penalty) => {
      const severity = penalty.severity;
      counts[severity] = (counts[severity] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return {
      totalPenalties: penalties.length,
      penaltyTypes: typeCounts,
      severityDistribution: severityCounts,
    };
  }

  private analyzeDRSZones(drsMessages: any[]) {
    // This is a simplified implementation
    // In reality, you'd need track position data to accurately identify DRS zones
    const enabledMessages = drsMessages.filter(m => 
      m.message.toUpperCase().includes('DRS ENABLED')
    );

    return enabledMessages.map((message, index) => ({
      zone: index + 1,
      enabled: message.timestamp,
      message: message.message,
    }));
  }

  private analyzeDRSActivations(drsMessages: any[]) {
    return {
      totalMessages: drsMessages.length,
      enabledCount: drsMessages.filter(m => 
        m.message.toUpperCase().includes('ENABLED')
      ).length,
      disabledCount: drsMessages.filter(m => 
        m.message.toUpperCase().includes('DISABLED')
      ).length,
    };
  }
}
import axios from "axios";
import { XMLParser } from "fast-xml-parser";

interface NDZViolation {
  serialNumber: string;
  closestDistanceInMm: number;
  pilot: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string;
  } | null;
  latestCaptureDateAndTime: Date;
}

/**
 * Monitors no drone zone violations based on the drone flight information
 * reported at https://assignments.reaktor.com/birdnest/drones.
 *
 * The list of violations contains information about a violation per drone and
 * is updated every 2 seconds. The information is stored for 10 minutes since
 * the last detected violation.
 * */
class NDZViolationMonitor {
  readonly minToStoreViolationFor = 10;
  // 2 seconds is the update interval at
  // https://assignments.reaktor.com/birdnest/drones.
  readonly fetchIntervalInSecs = 2;
  private violations: NDZViolation[] = [];
  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  private throttle = false;

  start() {
    setInterval(() => {
      this.checkNewViolations();
      this.removeTooOldViolations();
    }, this.fetchIntervalInSecs * 1000);
  }

  getViolations() {
    return [...this.violations];
  }

  private async checkNewViolations() {
    if (this.throttle) return;

    const droneReport = await this.fetchDrones();

    if (!droneReport) return;

    const droneCapture = droneReport.report.capture.drone as any[];

    if (!droneCapture.length) return;

    const distToNestPerDrone = droneCapture.map((drone: any) => ({
      serialNumber: drone.serialNumber as string,
      distance: this.calcDistanceToNDZcenter(drone),
    }));

    const NDZRadiusInMm = 100_000;
    const tooCloseDistPerDrone = distToNestPerDrone.filter(
      ({ distance }) => distance <= NDZRadiusInMm
    );

    if (!tooCloseDistPerDrone.length) return;

    const pilots = await this.fetchPilots(
      tooCloseDistPerDrone.map(({ serialNumber }) => serialNumber)
    );

    const violations: NDZViolation[] = tooCloseDistPerDrone.map(
      ({ distance, serialNumber }, index) => {
        return {
          serialNumber,
          closestDistanceInMm: distance,
          pilot: pilots && pilots[index] ? pilots[index] : null,
          latestCaptureDateAndTime: new Date(
            droneReport.report.capture["@_snapshotTimestamp"]
          ),
        };
      }
    );

    this.addOrUpdateViolations(violations);
  }

  private async fetchDrones() {
    try {
      const XMLresponse = await axios.get(
        "https://assignments.reaktor.com/birdnest/drones"
      );
      return this.xmlParser.parse(XMLresponse.data);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        // Sometimes the API responds with a rate limit error. In that case,
        // wait a bit before making new requests.
        if (error.response && error.response.status === 429) {
          this.throttle = true;
          setTimeout(() => (this.throttle = false), 6000);
          console.log(
            `(${new Date()}) Rate limit exceeded at https://assignments.reaktor.com/birdnest/drones. Waiting for 6 seconds before making new requests...`
          );
        }
      } else {
        console.log(error);
      }
    }

    return null;
  }

  private calcDistanceToNDZcenter(drone: any) {
    const NDZcenterPosX = 250_000;
    const NDZcenterPosY = 250_000;
    const x = drone.positionX - NDZcenterPosX;
    const y = drone.positionY - NDZcenterPosY;

    return Math.sqrt(Math.abs(x) ** 2 + Math.abs(y) ** 2);
  }

  private async fetchPilots(droneSerialNumbers: string[]) {
    try {
      const requests = droneSerialNumbers.map((serialNumber) =>
        axios.get(
          `https://assignments.reaktor.com/birdnest/pilots/${serialNumber}`
        )
      );

      const results = await Promise.allSettled(requests);

      return results.map((result) => {
        if (result.status === "fulfilled") {
          const response = result.value;
          if (response.status === 200) {
            return (({ firstName, lastName, phoneNumber, email }) => ({
              firstName: firstName as string,
              lastName: lastName as string,
              phoneNumber: phoneNumber as string,
              email: email as string,
            }))(response.data);
          }
          return null;
        }
        return null;
      });
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  private addOrUpdateViolations(violations: NDZViolation[]) {
    for (const violation of violations) {
      const existingViolation = this.violations.find(
        (v) => v.serialNumber === violation.serialNumber
      );
      if (existingViolation) {
        existingViolation.latestCaptureDateAndTime =
          violation.latestCaptureDateAndTime;
        if (
          violation.closestDistanceInMm <= existingViolation.closestDistanceInMm
        ) {
          existingViolation.closestDistanceInMm = violation.closestDistanceInMm;
        }
      } else {
        this.violations.push(violation);
      }
    }
  }

  private removeTooOldViolations() {
    const msToStoreFor = this.minToStoreViolationFor * 60 * 1000;
    this.violations = this.violations.filter((violation) => {
      const timeDiff =
        new Date().getTime() - violation.latestCaptureDateAndTime.getTime();
      return timeDiff <= msToStoreFor;
    });
  }
}

export default NDZViolationMonitor;

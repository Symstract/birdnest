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
  private _lastUpdatedAt: Date | null = null;
  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  private throttle = false;

  get lastUpdatedAt() {
    return this._lastUpdatedAt;
  }

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

    const distToNDZCenterPerDrone = droneCapture.map((drone: any) => ({
      serialNumber: drone.serialNumber as string,
      distance: this.calcDistanceToNDZcenter(drone),
    }));

    const NDZRadiusInMm = 100_000;
    const tooCloseDistPerDrone = distToNDZCenterPerDrone.filter(
      ({ distance }) => distance <= NDZRadiusInMm
    );

    if (!tooCloseDistPerDrone.length) return;

    const existingSerialNumbers = this.violations.map(
      ({ serialNumber }) => serialNumber
    );

    const tooCloseDistPerNewDrone = tooCloseDistPerDrone.filter(
      ({ serialNumber }) => {
        return !existingSerialNumbers.includes(serialNumber);
      }
    );

    const newPilots = await this.fetchPilots(
      tooCloseDistPerNewDrone.map(({ serialNumber }) => serialNumber)
    );

    if (!newPilots) return;

    const newViolations: NDZViolation[] = tooCloseDistPerNewDrone.map(
      ({ serialNumber, distance }, index) => ({
        serialNumber: serialNumber,
        pilot: newPilots[index],
        closestDistanceInMm: distance,
        latestCaptureDateAndTime: new Date(
          droneReport.report.capture["@_snapshotTimestamp"]
        ),
      })
    );

    this.violations.push(...newViolations);

    this.updateViolations(
      distToNDZCenterPerDrone,
      new Date(droneReport.report.capture["@_snapshotTimestamp"])
    );

    this._lastUpdatedAt = new Date();
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

  private updateViolations(
    distancePerDrone: {
      serialNumber: string;
      distance: number;
    }[],
    dateAndTime: Date
  ) {
    const serialNumberViolationMap = Object.fromEntries(
      this.violations.map((violation) => [violation.serialNumber, violation])
    );

    for (const distAndDrone of distancePerDrone) {
      const violation = serialNumberViolationMap[distAndDrone.serialNumber];
      if (violation) {
        violation.latestCaptureDateAndTime = dateAndTime;
        if (distAndDrone.distance <= violation.closestDistanceInMm) {
          violation.closestDistanceInMm = distAndDrone.distance;
        }
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

const violationMonitor = new NDZViolationMonitor();

export default violationMonitor;

// App entry. The driver's background location task must be registered before anything else runs:
// Android can wake the app just to deliver a position, before any screen loads.
import './src/lib/driverTracking';
import 'expo-router/entry';

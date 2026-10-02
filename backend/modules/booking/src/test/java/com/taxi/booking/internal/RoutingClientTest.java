package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.taxi.shared.GeoPoint;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class RoutingClientTest {

    private static final GeoPoint LOUVRE = new GeoPoint(48.8606, 2.3376);
    private static final GeoPoint ARC = new GeoPoint(48.8738, 2.2950);

    private MockRestServiceServer osrm;
    private RoutingClient routing;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder().baseUrl("https://osrm.test");
        osrm = MockRestServiceServer.bindTo(builder).build();
        routing = new RoutingClient(builder.build());
    }

    @Test
    void asksForTheRoadAsGeoJsonAndReturnsItAsLngLatPoints() {
        osrm.expect(requestTo(Matchers.startsWith("https://osrm.test/route/v1/driving/2.337600,48.860600;2.295000,48.873800")))
                .andExpect(queryParam("geometries", "geojson"))
                .andExpect(queryParam("overview", "simplified"))
                .andRespond(withSuccess("""
                        {"code": "Ok", "routes": [{"distance": 4012.4, "duration": 899.6, "geometry":
                          {"type": "LineString", "coordinates": [[2.3376, 48.8606], [2.31, 48.87], [2.295, 48.8738]]}}]}""",
                        MediaType.APPLICATION_JSON));

        var r = routing.route(LOUVRE, ARC);

        osrm.verify();
        assertThat(r.distanceM()).isEqualTo(4012);
        assertThat(r.durationS()).isEqualTo(900);
        assertThat(r.estimated()).isFalse();
        assertThat(r.path()).hasSize(3);
        assertThat(r.path().getFirst()).containsExactly(2.3376, 48.8606);
        assertThat(r.path().getLast()).containsExactly(2.295, 48.8738);
    }

    @Test
    void serverDownMeansAnEstimateAndNoRoad() {
        osrm.expect(requestTo(Matchers.startsWith("https://osrm.test/route/"))).andRespond(withServerError());
        var r = routing.route(LOUVRE, ARC);
        assertThat(r.estimated()).isTrue();
        assertThat(r.path()).isNull();
    }

    @Test
    void longRoadsAreThinnedEvenlyKeepingBothEnds() {
        var points = new ArrayList<double[]>();
        IntStream.range(0, 1000).forEach(i -> points.add(new double[] {i, -i}));

        var kept = RoutingClient.downsample(points, RoutingClient.MAX_POINTS);

        assertThat(kept).hasSize(400);
        assertThat(kept.getFirst()).containsExactly(0, 0);
        assertThat(kept.getLast()).containsExactly(999, -999);
        for (int i = 1; i < kept.size(); i++) {
            assertThat(kept.get(i)[0] - kept.get(i - 1)[0]).isBetween(2.0, 3.0); // even spacing, in order
        }
        assertThat(RoutingClient.downsample(points.subList(0, 50), 400)).hasSize(50);
        assertThat(RoutingClient.downsample(List.of(new double[] {1, 2}), 400)).isNull(); // not a line
    }
}
